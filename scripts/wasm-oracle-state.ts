// The mGBA oracle of our platform layer (#43, plan B3, section 2.3): the video states the shot
// tool dumps (rom/gen3/shot/replay_state.c holds the format), the script that draws one of them
// with our renderer in the host harness, and the per-line comparison with mGBA's own frame.
import { widenChannel } from '../src/web/wasm/frame.ts'
import type { Frame } from './rom-shot-probes.ts'
import { dmaSet, FRAME_HEIGHT, FRAME_WIDTH, load, write16 } from './wasm-layer-script.ts'
import type { Op } from './wasm-layer-script.ts'
import { IO, OAM, PRAM, VRAM } from './wasm-layer-video.ts'

const MAGIC = 0x53565249
const VERSION = 1
const HEADER_BYTES = 7 * 4
const EWRAM = 0x02000000
const AREAS = { io: 0x400, pram: 0x400, vram: 0x18000, oam: 0x400, ewram: 0x40000 } as const

export interface VideoState {
  frame: number
  /** DMA0's internal source, destination and count, as mGBA keeps them. */
  dma0: { source: number; dest: number; count: number }
  io: Uint8Array
  pram: Uint8Array
  vram: Uint8Array
  oam: Uint8Array
  /** Present while DMA0 runs at HBlank. */
  ewram?: Uint8Array
}

export function parseVideoState(bytes: Uint8Array): VideoState {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const word = (i: number) => (bytes.length >= 4 * (i + 1) ? view.getUint32(4 * i, true) : -1)
  if (word(0) !== MAGIC) throw new Error('not a video state of the shot tool (no IRVS)')
  if (word(1) !== VERSION) throw new Error(`video state version ${String(word(1))}, expected 1`)
  const hasEwram = (word(3) & 1) === 1
  const length = HEADER_BYTES + 0x400 * 3 + 0x18000 + (hasEwram ? AREAS.ewram : 0)
  if (bytes.length !== length) {
    throw new Error(`a video state of ${String(bytes.length)} bytes, expected ${String(length)}`)
  }
  let at = HEADER_BYTES
  const take = (size: number) => bytes.subarray(at, (at += size))
  const dma0 = { source: word(4), dest: word(5), count: word(6) }
  const [io, pram, vram, oam] = [
    take(AREAS.io),
    take(AREAS.pram),
    take(AREAS.vram),
    take(AREAS.oam),
  ]
  const state: VideoState = { frame: word(2), dma0, io, pram, vram, oam }
  if (hasEwram) state.ewram = take(AREAS.ewram)
  return state
}

// GBATEK "GBA DMA Transfers": DMA0 at 0x040000B0, its control in bits 0-15 (count) and 16-31.
const DMA0_SAD = 0xb0
const DMA0_DAD = 0xb4
const DMA0_CNT = 0xb8
const DMA_32BIT = 0x0400

const ioWord = (state: VideoState, offset: number) =>
  new DataView(state.io.buffer, state.io.byteOffset).getUint32(offset, true)

/**
 * The scanline effect's DMA0 again (U/src/scanline_effect.c): the game writes a table's entry 0
 * into the register itself and lets DMA0 copy entry n after line n - 1. So line 0 shows the unit
 * before the DMA's start, and the replay sets the register to it, then starts DMA0 there.
 */
function hblankOps(state: VideoState, ewram: Uint8Array): Op[] {
  const control = ioWord(state, DMA0_CNT)
  const source = ioWord(state, DMA0_SAD)
  const dest = ioWord(state, DMA0_DAD)
  const unit = ((control >>> 16) & DMA_32BIT) !== 0 ? 4 : 2
  const count = control & 0x3fff || 0x4000
  const first = source - EWRAM - unit * count
  const ops: Op[] = [load(EWRAM, ewram)]
  if (first >= 0) {
    const view = new DataView(ewram.buffer, ewram.byteOffset)
    for (let i = 0; i < (unit * count) / 2; i++) {
      ops.push(write16(dest + 2 * i, view.getUint16(first + 2 * i, true)))
    }
  }
  ops.push(dmaSet(0, source, dest, control))
  return ops
}

/** The script that draws the state: its four areas, then DMA0 at HBlank when it ran. */
export function stateOps(state: VideoState): Op[] {
  const io = state.io.slice()
  // DMA0 starts from the replay's own DmaSet, so the IO it loads holds the channel disabled.
  if (state.ewram !== undefined) io[DMA0_CNT + 3] = (io[DMA0_CNT + 3] ?? 0) & 0x7f
  const ops = [load(IO, io), load(PRAM, state.pram), load(VRAM, state.vram), load(OAM, state.oam)]
  return state.ewram === undefined ? ops : [...ops, ...hblankOps(state, state.ewram)]
}

export interface FrameDiff {
  pixels: number
  /** The lines with a difference, with their count of differing pixels. */
  lines: { line: number; pixels: number }[]
}

/** Our BGR555 frame against mGBA's RGB frame, each channel widened as the page does. */
export function diffFrame(ours: Uint16Array, theirs: Frame): FrameDiff {
  if (theirs.width !== FRAME_WIDTH || theirs.height !== FRAME_HEIGHT) {
    throw new Error(`mGBA's frame is ${String(theirs.width)}x${String(theirs.height)}`)
  }
  const lines: FrameDiff['lines'] = []
  let pixels = 0
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    let count = 0
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const i = y * FRAME_WIDTH + x
      if (widenedRgb(ours[i] ?? 0) !== rgbAt(theirs.rgb, i)) count++
    }
    if (count > 0) lines.push({ line: y, pixels: count })
    pixels += count
  }
  return { pixels, lines }
}

const widenedRgb = (colour: number) =>
  (widenChannel(colour & 31) << 16) |
  (widenChannel((colour >> 5) & 31) << 8) |
  widenChannel((colour >> 10) & 31)

const rgbAt = (rgb: Uint8Array, i: number) =>
  ((rgb[3 * i] ?? 0) << 16) | ((rgb[3 * i + 1] ?? 0) << 8) | (rgb[3 * i + 2] ?? 0)

/** Ours and mGBA's frame side by side as a binary PPM, for a look at a difference. */
export function sideBySide(ours: Uint16Array, theirs: Frame): Uint8Array {
  const header = new TextEncoder().encode(
    `P6\n${String(2 * FRAME_WIDTH)} ${String(FRAME_HEIGHT)}\n255\n`,
  )
  const body = new Uint8Array(2 * FRAME_WIDTH * FRAME_HEIGHT * 3)
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const i = y * FRAME_WIDTH + x
      const rgb = widenedRgb(ours[i] ?? 0)
      body.set([rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff], (2 * y * FRAME_WIDTH + x) * 3)
      body.set(theirs.rgb.subarray(3 * i, 3 * i + 3), (2 * y * FRAME_WIDTH + FRAME_WIDTH + x) * 3)
    }
  }
  const out = new Uint8Array(header.length + body.length)
  out.set(header)
  out.set(body, header.length)
  return out
}
