// The mGBA oracle of our platform layer (#43, plan B3, section 2.3): the video states the shot
// tool dumps (rom/gen3/shot/replay_state.c holds the format), the script that draws one of them
// with our renderer in the host harness, and the per-line comparison with mGBA's own frame.
import { widenChannel } from '../src/web/wasm/frame.ts'
import type { Frame } from './rom-shot-probes.ts'
import { dmaSet, FRAME_HEIGHT, FRAME_WIDTH, load, traceAt, write16 } from './wasm-layer-script.ts'
import type { Op, PixelTrace } from './wasm-layer-script.ts'
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
  // A copy: the state may sit in a Buffer from readFileSync, whose slice() shares its memory.
  const io = new Uint8Array(state.io)
  // DMA0 starts from the replay's own DmaSet, so the IO it loads holds the channel disabled.
  if (state.ewram !== undefined) io[DMA0_CNT + 3] = (io[DMA0_CNT + 3] ?? 0) & 0x7f
  const ops = [load(IO, io), load(PRAM, state.pram), load(VRAM, state.vram), load(OAM, state.oam)]
  return state.ewram === undefined ? ops : [...ops, ...hblankOps(state, state.ewram)]
}

export interface FrameDiff {
  pixels: number
  /** The lines with a difference, with their count of differing pixels. */
  lines: { line: number; pixels: number }[]
  /** With a trace: the pixels we drew other than GBATEK's result of their trace (gbatekColour). */
  offTrace?: number
}

const EFFECT_ALPHA = 1
const EFFECT_UP = 2
const EFFECT_DOWN = 3

/**
 * mGBA darkens red as GBATEK has it, I - I * EVY / 16 with the product rounded down, but green
 * and blue as I * (16 - EVY) / 16 rounded down, one lower where the product leaves a remainder.
 * Found black-box in step B4: every channel of 994052's states 5520, 7800, 10560 and 10740.
 */
const mgbaDarker = (channel: number, evy: number, red: boolean) =>
  red ? channel - ((channel * evy) >> 4) : (channel * (16 - evy)) >> 4

/**
 * The colour mGBA shows for a pixel of the harness's trace. mGBA's frame holds 8-bit channels:
 * it widens each 5-bit channel as the page does, and applies a colour special effect to the
 * widened channels with GBATEK's formulas, each product of a coefficient counting sixteenths and
 * rounded down (darkening apart, see mgbaDarker). So a pixel with an effect falls between two
 * 5-bit colours in mGBA's frame, and our layer, which gives 5-bit colours as the GBA does, can
 * never equal it. Found black-box in step B4: every channel of hand-made's state 900 fits, 58977
 * of 58977.
 */
export function mgbaRgb(trace: PixelTrace): number {
  let rgb = 0
  for (let shift = 0; shift < 15; shift += 5) {
    const top = widenChannel((trace.top >> shift) & 31)
    const below = widenChannel((trace.below >> shift) & 31)
    let channel = top
    if (trace.effect === EFFECT_ALPHA)
      channel = Math.min(255, (top * trace.eva + below * trace.evb) >> 4)
    else if (trace.effect === EFFECT_UP) channel = top + (((255 - top) * trace.evy) >> 4)
    else if (trace.effect === EFFECT_DOWN) channel = mgbaDarker(top, trace.evy, shift === 0)
    rgb |= channel << (16 - (8 * shift) / 5)
  }
  return rgb
}

const CHANNEL_MAX = 31

/**
 * The BGR555 colour GBATEK gives a pixel of the harness's trace ("LCD I/O Color Special Effects"):
 * per 5-bit channel, alpha MIN(31, top * EVA + below * EVB), brighter top + (31 - top) * EVY,
 * darker top - top * EVY, each product counting sixteenths and rounded down. The layer's frame
 * must hold this colour wherever the oracle grades its trace against mGBA.
 */
export function gbatekColour(trace: PixelTrace): number {
  let colour = 0
  for (let shift = 0; shift < 15; shift += 5) {
    const top = (trace.top >> shift) & CHANNEL_MAX
    const below = (trace.below >> shift) & CHANNEL_MAX
    let channel = top
    if (trace.effect === EFFECT_ALPHA)
      channel = Math.min(CHANNEL_MAX, (top * trace.eva + below * trace.evb) >> 4)
    else if (trace.effect === EFFECT_UP) channel = top + (((CHANNEL_MAX - top) * trace.evy) >> 4)
    else if (trace.effect === EFFECT_DOWN) channel = top - ((top * trace.evy) >> 4)
    colour |= channel << shift
  }
  return colour
}

/** One pixel's verdict: whether it differs from mGBA's, and whether we drew it off its trace. */
function pixelVerdict(drawn: number, theirs: number, trace: Uint8Array | undefined, i: number) {
  if (trace === undefined) return { differs: widenedRgb(drawn) !== theirs, off: false }
  const traced = traceAt(trace, i)
  const off = drawn !== gbatekColour(traced)
  return { differs: off || mgbaRgb(traced) !== theirs, off }
}

/**
 * Our BGR555 frame against mGBA's RGB frame, each channel widened as the page does. With the
 * harness's trace of our frame, each pixel's colour as mGBA would show our layers and effect, and
 * our drawn pixel must be GBATEK's result of the same trace: a pixel differs when either fails.
 */
export function diffFrame(ours: Uint16Array, theirs: Frame, trace?: Uint8Array): FrameDiff {
  if (theirs.width !== FRAME_WIDTH || theirs.height !== FRAME_HEIGHT) {
    throw new Error(`mGBA's frame is ${String(theirs.width)}x${String(theirs.height)}`)
  }
  const lines: FrameDiff['lines'] = []
  let pixels = 0
  let offTrace = 0
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    let count = 0
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const i = y * FRAME_WIDTH + x
      const { differs, off } = pixelVerdict(ours[i] ?? 0, rgbAt(theirs.rgb, i), trace, i)
      if (off) offTrace++
      if (differs) count++
    }
    if (count > 0) lines.push({ line: y, pixels: count })
    pixels += count
  }
  return trace === undefined ? { pixels, lines } : { pixels, lines, offTrace }
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
