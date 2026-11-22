// The affine backgrounds of our platform layer's renderer (#43, plan B5), drawn natively in the
// host harness. Each scene follows GBATEK's "LCD I/O BG Rotation/Scaling", "LCD I/O BG Control"
// (the map sizes and the overflow bit), "LCD VRAM BG Screen Data Format (BG Map)" (one byte per
// entry, 256-colour tiles), "LCD I/O Display Control" (the BG modes) and "LCD I/O Mosaic
// Function".
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import { frame, FRAME_BYTES, onIrq, runScript } from './wasm-layer-script.ts'
import {
  bgCnt,
  bgControl,
  dispcntBg,
  DISPSTAT_VBLANK_IRQ,
  DISPSTAT_VCOUNT_IRQ,
  drawFrame,
  INTR_VBLANK,
  INTR_VCOUNT,
  IO,
  pixel,
  REG,
  rgb,
  row,
  solid4,
  solid8,
  videoOps,
  Video,
} from './wasm-layer-video.ts'
import type { BgControl, DrawnFrame } from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-affine-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const BACKDROP = rgb(1, 2, 3)
const RED = rgb(31, 0, 0)
const GREEN = rgb(0, 31, 0)
const RED_INDEX = 0x21
const GREEN_INDEX = 0x42

// GBATEK "LCD I/O BG Rotation/Scaling": PA, PB, PC and PD, then the reference point X and Y, 16
// bytes per BG from 0x04000020 for BG2 and 0x04000030 for BG3.
const affineReg = (bg: number, offset: number) => 0x20 + 0x10 * (bg - 2) + offset
const [X, Y] = [8, 12]
const px = (pixels: number) => pixels * 0x100

interface Affine {
  pa?: number
  pb?: number
  pc?: number
  pd?: number
  /** The reference point as the 28-bit register values, 8.8 fixed point. */
  x?: number
  y?: number
}

function setAffine(video: Video, bg: number, affine: Affine): Video {
  const { pa = 0x100, pb = 0, pc = 0, pd = 0x100, x = 0, y = 0 } = affine
  ;[pa, pb, pc, pd].forEach((value, i) => video.io16(affineReg(bg, 2 * i), value & 0xffff))
  for (const [offset, value] of [
    [X, x],
    [Y, y],
  ] as const) {
    video.io16(affineReg(bg, offset), value & 0xffff).io16(affineReg(bg, offset + 2), value >>> 16)
  }
  return video
}

interface Entry {
  tile?: number
  /** The map is 16 << size tiles wide. */
  size?: number
  screenBase?: number
}

/** The map entry at tile (x, y). */
function place(video: Video, x: number, y: number, entry: Entry = {}): Video {
  const { tile = 1, size = 0, screenBase = 0 } = entry
  video.vram[screenBase * 0x800 + y * (16 << size) + x] = tile
  return video
}

/** BG `bg` in `mode`, tiles at char base 1 (tile 1 red, 2 green), its map at screen base 0. */
function affineBg(mode: number, bg = 2, control: BgControl = {}, affine: Affine = {}): Video {
  const video = new Video()
    .io16(REG.DISPCNT, mode | dispcntBg(bg))
    .io16(bgCnt(bg), bgControl({ charBase: 1, ...control }))
    .bgColor(0, BACKDROP)
    .bgColor(RED_INDEX, RED)
    .bgColor(GREEN_INDEX, GREEN)
    .bgTile(1, 1, solid8(RED_INDEX))
    .bgTile(1, 2, solid8(GREEN_INDEX))
  return setAffine(video, bg, affine)
}

const drawnAt = (pixels: number[]) =>
  pixels.flatMap((colour, x) => (colour === BACKDROP ? [] : [x]))
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
/** The lines whose pixel at x 0 is not the backdrop. */
const linesAt = (drawn: DrawnFrame) =>
  Array.from({ length: 160 }, (_, y) => y).filter((y) => pixel(drawn, 0, y) !== BACKDROP)

/** Two frames of the frame driver on one state. */
function twoFrames(video: Video): [Uint16Array, Uint16Array, string] {
  const { dest, log } = runScript(host, [...videoOps(video), frame, frame], 2 * FRAME_BYTES)
  const first = new Uint16Array(dest.slice(0, FRAME_BYTES).buffer)
  return [first, new Uint16Array(dest.slice(FRAME_BYTES).buffer), log]
}
const asFrame = (pixels: Uint16Array): DrawnFrame => ({ pixels, irqs: [], calls: 0 })

describe('an affine background', () => {
  it('shows its map as is under the identity matrix, in colours of the whole palette', () => {
    const drawn = drawFrame(host, place(affineBg(1), 1, 2))
    expect(drawnAt(row(drawn, 16))).toEqual(span(8, 15))
    expect(drawnAt(row(drawn, 23))).toEqual(span(8, 15))
    expect(drawnAt(row(drawn, 24))).toEqual([])
    expect(pixel(drawn, 8, 16)).toBe(RED)
  })

  it('ends transparent past its 128 pixels without the overflow bit, and wraps with it', () => {
    const open = drawFrame(host, place(affineBg(1), 1, 2))
    expect(drawnAt(row(open, 144))).toEqual([])
    const wrapped = drawFrame(host, place(affineBg(1, 2, { wrap: true }), 1, 2))
    expect(drawnAt(row(wrapped, 16))).toEqual([...span(8, 15), ...span(136, 143)])
    expect(drawnAt(row(wrapped, 144))).toEqual([...span(8, 15), ...span(136, 143)])
  })

  it('shows the image at half its width under PA 0x200', () => {
    const drawn = drawFrame(host, place(affineBg(1, 2, {}, { pa: 0x200 }), 2, 0))
    expect(drawnAt(row(drawn, 0))).toEqual(span(8, 11))
  })

  it('starts at the reference point, a signed 28-bit value', () => {
    const right = drawFrame(host, place(affineBg(1, 2, {}, { x: px(4) }), 1, 0))
    expect(drawnAt(row(right, 0))).toEqual(span(4, 11))
    const minus8 = 0x0ffff800
    const left = drawFrame(host, place(affineBg(1, 2, {}, { x: minus8 }), 0, 0))
    expect(drawnAt(row(left, 0))).toEqual(span(8, 15))
  })

  it('steps the reference point by PD after each line', () => {
    const drawn = drawFrame(host, place(affineBg(1, 2, {}, { pd: 0x200 }), 0, 2))
    expect(linesAt(drawn)).toEqual(span(8, 11))
  })

  it('steps it by PB after each line, and by PC along the line', () => {
    const sheared = drawFrame(host, place(affineBg(1, 2, {}, { pb: 0x100 }), 2, 0))
    expect(drawnAt(row(sheared, 0))).toEqual(span(16, 23))
    expect(drawnAt(row(sheared, 4))).toEqual(span(12, 19))
    const diagonal = drawFrame(host, place(affineBg(1, 2, {}, { pc: 0x100 }), 1, 1))
    expect(drawnAt(row(diagonal, 0))).toEqual(span(8, 15))
  })

  it.each([1, 2, 3])('reads the last tile of a map of size %i', (size) => {
    const last = (16 << size) - 1
    const corner = { x: px(last * 8), y: px(last * 8) }
    const drawn = drawFrame(host, place(affineBg(1, 2, { size }, corner), last, last, { size }))
    expect(drawnAt(row(drawn, 0))).toEqual(span(0, 7))
    expect(drawnAt(row(drawn, 8))).toEqual([])
  })
})

describe('the internal reference point', () => {
  /** BG2 of mode 1 with line interrupts on. */
  const withIrq = (dispstat: number, ie: number, lyc = 0) =>
    affineBg(1)
      .io16(REG.DISPSTAT, dispstat | (lyc << 8))
      .io16(REG.IE, ie)

  it('restarts at a BG2Y that the VCount handler of line 100 writes', () => {
    const video = place(withIrq(DISPSTAT_VCOUNT_IRQ, INTR_VCOUNT, 100), 0, 1)
    video.ops.push(onIrq(INTR_VCOUNT, IO + affineReg(2, Y), 0x0800))
    expect(linesAt(drawFrame(host, video))).toEqual([...span(8, 15), ...span(100, 107)])
  })

  it('restarts only the X written at line 100, and Y keeps stepping', () => {
    const video = place(withIrq(DISPSTAT_VCOUNT_IRQ, INTR_VCOUNT, 100), 1, 12)
    video.ops.push(onIrq(INTR_VCOUNT, IO + affineReg(2, X), 0x0800))
    const drawn = drawFrame(host, video)
    expect(drawnAt(row(drawn, 99))).toEqual(span(8, 15))
    expect(drawnAt(row(drawn, 100))).toEqual(span(0, 7))
    expect(drawnAt(row(drawn, 103))).toEqual(span(0, 7))
    expect(drawnAt(row(drawn, 104))).toEqual([])
  })

  it('reloads both at line 160, so the next frame starts again at the registers', () => {
    const [first, second] = twoFrames(place(affineBg(1), 0, 0))
    expect(linesAt(asFrame(first))).toEqual(span(0, 7))
    expect(linesAt(asFrame(second))).toEqual(span(0, 7))
  })

  it("takes a write of the VBlank handler as the next frame's origin", () => {
    const video = place(withIrq(DISPSTAT_VBLANK_IRQ, INTR_VBLANK), 0, 1)
    video.ops.push(onIrq(INTR_VBLANK, IO + affineReg(2, Y), 0x0800))
    const [first, second] = twoFrames(video)
    expect(linesAt(asFrame(first))).toEqual(span(8, 15))
    expect(linesAt(asFrame(second))).toEqual(span(0, 7))
  })
})

describe('the BG modes', () => {
  it('draw BG0 and BG1 as text and no BG3 in mode 1', () => {
    const video = place(affineBg(1, 3), 0, 0)
      .io16(REG.DISPCNT, 1 | dispcntBg(0) | dispcntBg(3))
      .io16(bgCnt(0), bgControl({ charBase: 2, screenBase: 31 }))
      .bgColor(2, GREEN)
      .bgTile(2, 1, solid4(2))
      .bgMap(31, 2, 0, { tile: 1 })
    const drawn = drawFrame(host, video)
    expect(drawnAt(row(drawn, 0))).toEqual(span(16, 23))
    expect(pixel(drawn, 16, 0)).toBe(GREEN)
  })

  it('draw BG2 and BG3 as affine BGs in priority order and no BG0 in mode 2', () => {
    const video = affineBg(2, 2, { priority: 1 })
      .io16(REG.DISPCNT, 2 | dispcntBg(0) | dispcntBg(2) | dispcntBg(3))
      .io16(bgCnt(3), bgControl({ charBase: 1, screenBase: 4, priority: 0 }))
      .io16(bgCnt(0), bgControl({ charBase: 2, screenBase: 31 }))
      .bgTile(2, 1, solid4(2))
      .bgFill(31, { tile: 1 })
    setAffine(video, 3, { x: 0x0ffff800 })
    place(place(video, 0, 0), 1, 0)
    place(video, 0, 0, { tile: 2, screenBase: 4 })
    const drawn = drawFrame(host, video)
    expect(row(drawn, 0).slice(0, 17)).toEqual([
      ...Array<number>(8).fill(RED),
      ...Array<number>(8).fill(GREEN),
      BACKDROP,
    ])
  })

  it.each([3, 4, 5, 6, 7])('show the backdrop in mode %i and say so once', (mode) => {
    const video = affineBg(mode)
    video.vram.fill(0x1f)
    const [first, second, log] = twoFrames(video)
    expect(first.every((colour) => colour === BACKDROP)).toBe(true)
    expect(second.every((colour) => colour === BACKDROP)).toBe(true)
    expect(log.split('\n').filter((line) => line !== '')).toEqual([
      `irv-layer: BG mode ${String(mode)} is not drawn; its lines show the backdrop`,
    ])
  })
})

describe('the mosaic of an affine background', () => {
  it("repeats each block's first pixel along the line and its first line downward", () => {
    const pattern = Array.from({ length: 64 }, (_, i) => RED_INDEX + ((i + (i >> 3)) % 8))
    const scene = (mosaic: boolean) => {
      const video = affineBg(1, 2, { mosaic }).io16(REG.MOSAIC, 0x33)
      for (let i = 1; i < 8; i++) video.bgColor(RED_INDEX + i, rgb(4 * i, 31 - 4 * i, i))
      return place(video.bgTile(1, 1, pattern), 0, 0)
    }
    const plain = drawFrame(host, scene(false))
    const mosaic = drawFrame(host, scene(true))
    for (let y = 0; y < 8; y++) {
      const expected = row(plain, y - (y % 4)).slice(0, 8)
      expect(row(mosaic, y).slice(0, 8)).toEqual(expected.map((_, x) => expected[x - (x % 4)]))
    }
  })
})
