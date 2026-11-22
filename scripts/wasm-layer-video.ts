// Video states for the specs of our platform layer's renderer (#43, plan B3): IO, palette, VRAM
// and OAM as plain bytes, filled with the formats of GBATEK's "LCD I/O BG Control", "LCD VRAM BG
// Screen Data Format (BG Map)", "LCD VRAM Character Data", "LCD Color Palettes" and "LCD OBJ -
// OAM Attributes". A state becomes a script for the harness: it loads the four areas, then runs
// the state's own operations, then one frame of the frame driver.
import {
  FRAME_BYTES,
  FRAME_WIDTH,
  frame,
  IRQ_LOG_ENTRY,
  irqLog,
  load,
  runScript,
  TRACE_BYTES,
  traceFrame,
} from './wasm-layer-script.ts'
import type { Op } from './wasm-layer-script.ts'

export const IO = 0x04000000
export const PRAM = 0x05000000
export const VRAM = 0x06000000
export const OAM = 0x07000000
const OBJ_PALETTE = 0x200
const OBJ_TILES = 0x10000

// GBATEK "LCD I/O Display Control", "LCD I/O Interrupts and Status", "LCD I/O BG Control",
// "LCD I/O BG Scrolling", "LCD I/O Window Feature", "LCD I/O Mosaic Function", "LCD I/O Color
// Special Effects", "GBA Interrupt Control".
export const REG = {
  DISPCNT: 0x000,
  DISPSTAT: 0x004,
  VCOUNT: 0x006,
  BG0CNT: 0x008,
  BG0HOFS: 0x010,
  BG0VOFS: 0x012,
  WIN0H: 0x040,
  WIN1H: 0x042,
  WIN0V: 0x044,
  WIN1V: 0x046,
  WININ: 0x048,
  WINOUT: 0x04a,
  MOSAIC: 0x04c,
  BLDCNT: 0x050,
  BLDALPHA: 0x052,
  BLDY: 0x054,
  IE: 0x200,
  IF: 0x202,
  IME: 0x208,
} as const
export const bgCnt = (bg: number) => REG.BG0CNT + 2 * bg
export const bgHofs = (bg: number) => REG.BG0HOFS + 4 * bg
export const bgVofs = (bg: number) => REG.BG0VOFS + 4 * bg

export const DISPCNT_OBJ_1D = 1 << 6
export const DISPCNT_FORCED_BLANK = 1 << 7
export const dispcntBg = (bg: number) => 1 << (8 + bg)
export const DISPCNT_OBJ = 1 << 12
export const DISPCNT_WIN0 = 1 << 13
export const DISPCNT_WIN1 = 1 << 14
export const DISPCNT_OBJ_WINDOW = 1 << 15

/** A window's edges: left and right plus 1, top and bottom plus 1. */
export const windowH = (x1: number, x2: number) => (x1 << 8) | x2
export const windowV = (y1: number, y2: number) => (y1 << 8) | y2

/** The layer bits of WININ, WINOUT and BLDCNT's targets: BG0-BG3, OBJ, then the effect (or the backdrop). */
export const LAYER_OBJ = 1 << 4
export const WINDOW_EFFECT = 1 << 5
export const LAYER_BACKDROP = 1 << 5
export const BLEND_ALPHA = 1 << 6
export const BLEND_UP = 2 << 6
export const BLEND_DOWN = 3 << 6
export const bldcnt = (first: number, mode: number, second: number) => first | mode | (second << 8)

export const DISPSTAT_VBLANK_IRQ = 1 << 3
export const DISPSTAT_HBLANK_IRQ = 1 << 4
export const DISPSTAT_VCOUNT_IRQ = 1 << 5
export const INTR_VBLANK = 1 << 0
export const INTR_HBLANK = 1 << 1
export const INTR_VCOUNT = 1 << 2

/** BGR555 from 5-bit channels. */
export const rgb = (r: number, g: number, b: number) => r | (g << 5) | (b << 10)
export const WHITE = 0x7fff

export interface BgControl {
  priority?: number
  charBase?: number
  screenBase?: number
  colors256?: boolean
  mosaic?: boolean
  size?: number
}

export const bgControl = (control: BgControl) =>
  (control.priority ?? 0) |
  ((control.charBase ?? 0) << 2) |
  (control.mosaic === true ? 0x40 : 0) |
  (control.colors256 === true ? 0x80 : 0) |
  ((control.screenBase ?? 0) << 8) |
  ((control.size ?? 0) << 14)

export interface MapEntry {
  tile: number
  hflip?: boolean
  vflip?: boolean
  palette?: number
}

const mapEntry = (entry: MapEntry) =>
  entry.tile |
  (entry.hflip === true ? 0x400 : 0) |
  (entry.vflip === true ? 0x800 : 0) |
  ((entry.palette ?? 0) << 12)

/** Eight rows of eight colour indices each, one hex digit per pixel for 4 bpp. */
export function tile4(rows: readonly string[]): number[] {
  if (rows.length !== 8 || rows.some((row) => !/^[0-9a-f]{8}$/.test(row))) {
    throw new Error('a 4 bpp tile is eight rows of eight hex digits')
  }
  const indices = rows.flatMap((row) => Array.from(row, (digit) => parseInt(digit, 16)))
  return Array.from(
    { length: 32 },
    (_, i) => (indices[2 * i] ?? 0) | ((indices[2 * i + 1] ?? 0) << 4),
  )
}

/** A tile of one colour index. */
export const solid4 = (index: number) => tile4(Array(8).fill(index.toString(16).repeat(8)))
export const solid8 = (index: number) => Array<number>(64).fill(index)

export interface Obj {
  x: number
  y: number
  /** 0 square, 1 horizontal, 2 vertical. */
  shape?: number
  size?: number
  tile?: number
  priority?: number
  palette?: number
  hflip?: boolean
  colors256?: boolean
  disabled?: boolean
  /** The rotation/scaling group; set turns the OBJ affine. */
  affine?: number
  doubleSize?: boolean
  /** OBJ Mode 1 or 2 of attribute 0. */
  mode?: 'semi-transparent' | 'window'
  mosaic?: boolean
}

const OBJ_MODE = { 'semi-transparent': 1, window: 2 } as const

const bit = (set: boolean | undefined, value: number) => (set === true ? value : 0)

function objAttr0(obj: Obj): number {
  const affine = obj.affine !== undefined
  const flag9 = affine ? obj.doubleSize : obj.disabled
  return (
    (obj.y & 0xff) |
    bit(affine, 0x100) |
    bit(flag9, 0x200) |
    (obj.mode === undefined ? 0 : OBJ_MODE[obj.mode] << 10) |
    bit(obj.mosaic, 0x1000) |
    bit(obj.colors256, 0x2000) |
    ((obj.shape ?? 0) << 14)
  )
}

function objAttributes(obj: Obj): [number, number, number] {
  const bits9to13 = obj.affine === undefined ? bit(obj.hflip, 0x1000) : obj.affine << 9
  const attr1 = (obj.x & 0x1ff) | bits9to13 | ((obj.size ?? 0) << 14)
  const attr2 = (obj.tile ?? 0) | ((obj.priority ?? 0) << 10) | ((obj.palette ?? 0) << 12)
  return [objAttr0(obj), attr1, attr2]
}

/** IO, palette, VRAM and OAM of one frame, and operations to run before it. */
export class Video {
  readonly io = new Uint8Array(0x400)
  readonly pram = new Uint8Array(0x400)
  readonly vram = new Uint8Array(0x18000)
  readonly oam = new Uint8Array(0x400)
  readonly ops: Op[] = []

  io16(offset: number, value: number): this {
    new DataView(this.io.buffer).setUint16(offset, value, true)
    return this
  }

  bgColor(index: number, color: number): this {
    new DataView(this.pram.buffer).setUint16(2 * index, color, true)
    return this
  }

  objColor(index: number, color: number): this {
    return this.bgColor(OBJ_PALETTE / 2 + index, color)
  }

  bgTile(charBase: number, tile: number, bytes: readonly number[]): this {
    this.vram.set(bytes, charBase * 0x4000 + tile * bytes.length)
    return this
  }

  /** An OBJ tile at its number in steps of 32 bytes, for 4 and 8 bpp alike. */
  objTile(tile: number, bytes: readonly number[]): this {
    this.vram.set(bytes, OBJ_TILES + tile * 32)
    return this
  }

  /** The map entry at tile (x, y) of the 32x32 screen block. */
  bgMap(screenBase: number, x: number, y: number, entry: MapEntry): this {
    new DataView(this.vram.buffer).setUint16(
      screenBase * 0x800 + 2 * (y * 32 + x),
      mapEntry(entry),
      true,
    )
    return this
  }

  /** Every entry of the 32x32 screen block. */
  bgFill(screenBase: number, entry: MapEntry): this {
    for (let i = 0; i < 32 * 32; i++) this.bgMap(screenBase, i % 32, Math.floor(i / 32), entry)
    return this
  }

  obj(index: number, obj: Obj): this {
    const view = new DataView(this.oam.buffer)
    objAttributes(obj).forEach((attr, i) => {
      view.setUint16(8 * index + 2 * i, attr, true)
    })
    return this
  }

  /** PA, PB, PC and PD of a rotation/scaling group, 8.8 fixed point. */
  objAffine(group: number, [pa, pb, pc, pd]: readonly number[]): this {
    const view = new DataView(this.oam.buffer)
    ;[pa, pb, pc, pd].forEach((value, i) => {
      view.setInt16(32 * group + 6 + 8 * i, value ?? 0, true)
    })
    return this
  }
}

/** The loads of a state's four areas, then its own operations. */
export const videoOps = (video: Video): Op[] => [
  load(IO, video.io),
  load(PRAM, video.pram),
  load(VRAM, video.vram),
  load(OAM, video.oam),
  ...video.ops,
]

export interface DrawnFrame {
  pixels: Uint16Array
  irqs: { flag: number; vcount: number }[]
  calls: number
}

export const pixel = (drawn: DrawnFrame, x: number, y: number) =>
  drawn.pixels[y * FRAME_WIDTH + x] ?? -1

/** One row of the frame, as BGR555. */
export const row = (drawn: DrawnFrame, y: number) =>
  Array.from(drawn.pixels.subarray(y * FRAME_WIDTH, (y + 1) * FRAME_WIDTH))

/** Runs the state's script and one frame; `logMax` IRQ calls come back in order. */
export function drawFrame(host: string, video: Video, logMax = 0): DrawnFrame {
  const ops = [...videoOps(video), frame, irqLog(logMax)]
  const { calls, dest } = runScript(host, ops, FRAME_BYTES + logMax * IRQ_LOG_ENTRY)
  const pixels = new Uint16Array(dest.slice(0, FRAME_BYTES).buffer)
  const log = new Uint16Array(dest.slice(FRAME_BYTES).buffer)
  const irqs = []
  for (let i = 0; i < Math.min(calls, logMax); i++) {
    irqs.push({ flag: log[2 * i] ?? 0, vcount: log[2 * i + 1] ?? 0 })
  }
  return { pixels, irqs, calls }
}

/** Runs the state's script and one frame with the harness's trace of each pixel. */
export function traceVideo(host: string, video: Video) {
  const { dest } = runScript(host, [...videoOps(video), traceFrame], FRAME_BYTES + TRACE_BYTES)
  return {
    pixels: new Uint16Array(dest.slice(0, FRAME_BYTES).buffer),
    trace: dest.slice(FRAME_BYTES),
  }
}
