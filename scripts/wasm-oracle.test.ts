// The mGBA oracle's own parts (#43, plan B3): the dumped video state, the script that draws it in
// the host harness, the comparison with mGBA's frame and the report.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { widenChannel } from '../src/web/wasm/frame.ts'
import type { Frame } from './rom-shot-probes.ts'
import { buildHost } from './wasm-layer.ts'
import { frame, FRAME_BYTES, runScript } from './wasm-layer-script.ts'
import { rgb } from './wasm-layer-video.ts'
import { parseOracleArgs, stateFrames, summarize } from './wasm-oracle.ts'
import {
  diffFrame,
  gbatekColour,
  mgbaRgb,
  parseVideoState,
  sideBySide,
  stateOps,
} from './wasm-oracle-state.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-oracle-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const AREAS = 0x400 * 3 + 0x18000

/** A state as replay_state.c writes it, with IO and palette words set and EWRAM if given. */
function stateBytes(
  io: Record<number, number>,
  pram: Record<number, number>,
  ewram?: Uint8Array,
): Uint8Array {
  const bytes = new Uint8Array(28 + AREAS + (ewram?.length ?? 0))
  const view = new DataView(bytes.buffer)
  ;[0x53565249, 1, 120, ewram === undefined ? 0 : 1, 0, 0, 0].forEach((word, i) => {
    view.setUint32(4 * i, word, true)
  })
  for (const [offset, value] of Object.entries(io)) view.setUint32(28 + Number(offset), value, true)
  for (const [index, value] of Object.entries(pram)) {
    view.setUint16(28 + 0x400 + 2 * Number(index), value, true)
  }
  if (ewram !== undefined) bytes.set(ewram, 28 + AREAS)
  return bytes
}

const draw = (bytes: Uint8Array) => {
  const { dest } = runScript(host, [...stateOps(parseVideoState(bytes)), frame], FRAME_BYTES)
  return new Uint16Array(dest.buffer, dest.byteOffset, FRAME_BYTES / 2)
}

/** mGBA's frame of one colour per line. */
function linesFrame(colours: (y: number) => number): Frame {
  const frameRgb = new Uint8Array(240 * 160 * 3)
  for (let y = 0; y < 160; y++) {
    const c = colours(y)
    const pixel = [c & 31, (c >> 5) & 31, (c >> 10) & 31].map(widenChannel)
    for (let x = 0; x < 240; x++) frameRgb.set(pixel, 3 * (y * 240 + x))
  }
  return { width: 240, height: 160, rgb: frameRgb }
}

describe('a video state of the shot tool', () => {
  it('holds the frame, DMA0 and the four areas, and EWRAM when its flag says so', () => {
    const state = parseVideoState(stateBytes({ 0: 0x1234 }, { 0: 7 }, new Uint8Array(0x40000)))
    expect([state.frame, state.io[0], state.pram[0], state.vram.length, state.oam.length]).toEqual([
      120, 0x34, 7, 0x18000, 0x400,
    ])
    expect(state.ewram?.length).toBe(0x40000)
    expect(parseVideoState(stateBytes({}, {})).ewram).toBeUndefined()
  })

  it('refuses another magic, another version and a wrong length', () => {
    const bytes = stateBytes({}, {})
    expect(() => parseVideoState(bytes.subarray(0, 100))).toThrow(/100 bytes/)
    bytes[0] = 0
    expect(() => parseVideoState(bytes)).toThrow(/IRVS/)
    const versioned = stateBytes({}, {})
    versioned[4] = 2
    expect(() => parseVideoState(versioned)).toThrow(/version 2/)
  })
})

describe("mGBA's colour of a traced pixel", () => {
  const trace = { top: rgb(30, 25, 17), below: rgb(31, 31, 31), effect: 0, eva: 7, evb: 9, evy: 8 }
  const channels = (c: number) => [c >> 16, (c >> 8) & 0xff, c & 0xff]

  it('widens the top colour as the page does when the pixel has no effect', () => {
    expect(channels(mgbaRgb(trace))).toEqual([30, 25, 17].map(widenChannel))
  })

  it('blends the widened channels: (top * EVA + below * EVB) / 16, rounded down, at most 255', () => {
    // hand-made's state 900 at (0, 0): mGBA shows 251, 233, 204, not a widened 5-bit colour.
    expect(channels(mgbaRgb({ ...trace, effect: 1 }))).toEqual([251, 233, 204])
    expect(channels(mgbaRgb({ ...trace, effect: 1, eva: 16, evb: 16 }))).toEqual([255, 255, 255])
  })

  it('brightens and darkens the widened channels by EVY / 16, the product rounded down', () => {
    // widened 247, 206, 140
    expect(channels(mgbaRgb({ ...trace, effect: 2 }))).toEqual([251, 230, 197])
    expect(channels(mgbaRgb({ ...trace, effect: 3 }))).toEqual([124, 103, 70])
  })

  it('darkens red by subtracting its product, green and blue by multiplying by 16 - EVY', () => {
    // 994052's state 10740 (EVY 9): white turns 112, 111, 111.
    expect(channels(mgbaRgb({ ...trace, top: rgb(31, 31, 31), effect: 3, evy: 9 }))).toEqual([
      112, 111, 111,
    ])
  })
})

describe("GBATEK's colour of a traced pixel", () => {
  const trace = { top: rgb(30, 25, 17), below: rgb(31, 31, 31), effect: 0, eva: 7, evb: 9, evy: 8 }

  it('keeps the top colour when the pixel has no effect', () => {
    expect(gbatekColour(trace)).toBe(rgb(30, 25, 17))
  })

  it('blends the 5-bit channels: (top * EVA + below * EVB) / 16, rounded down, at most 31', () => {
    expect(gbatekColour({ ...trace, effect: 1 })).toBe(rgb(30, 28, 24))
    expect(gbatekColour({ ...trace, effect: 1, eva: 16, evb: 16 })).toBe(rgb(31, 31, 31))
  })

  it('brightens by (31 - I) * EVY / 16 and darkens by I * EVY / 16, the product rounded down', () => {
    expect(gbatekColour({ ...trace, effect: 2 })).toBe(rgb(30, 28, 24))
    expect(gbatekColour({ ...trace, effect: 3 })).toBe(rgb(15, 13, 9))
  })
})

describe('the script of a state', () => {
  it('draws the state as it was dumped', () => {
    const pixels = draw(stateBytes({}, { 0: rgb(3, 4, 5) }))
    expect(
      diffFrame(
        pixels,
        linesFrame(() => rgb(3, 4, 5)),
      ).pixels,
    ).toBe(0)
  })

  it("replays the scanline effect's DMA0: line 0 from the unit before its source, then one per line", () => {
    const table = Uint16Array.from({ length: 200 }, (_, i) => rgb(i % 32, 0, 1))
    const ewram = new Uint8Array(0x40000)
    ewram.set(new Uint8Array(table.buffer))
    const control = (0x8000 | 0x2000 | 0x0200 | 0x0060) * 0x10000 + 1
    const io = { 0xb0: 0x02000002, 0xb4: 0x05000000, 0xb8: control }
    const pixels = draw(stateBytes(io, { 0: 0x7fff }, ewram))
    expect(
      diffFrame(
        pixels,
        linesFrame((y) => table[y] ?? 0),
      ).pixels,
    ).toBe(0)
  })

  it('replays DMA0 from a state read as a Buffer, whose slice shares its memory', () => {
    const table = Uint16Array.from({ length: 200 }, (_, i) => rgb(i % 32, 0, 1))
    const ewram = new Uint8Array(0x40000)
    ewram.set(new Uint8Array(table.buffer))
    const control = (0x8000 | 0x2000 | 0x0200 | 0x0060) * 0x10000 + 1
    const io = { 0xb0: 0x02000002, 0xb4: 0x05000000, 0xb8: control }
    const pixels = draw(Buffer.from(stateBytes(io, { 0: 0x7fff }, ewram)))
    expect(
      diffFrame(
        pixels,
        linesFrame((y) => table[y] ?? 0),
      ).pixels,
    ).toBe(0)
  })
})

describe("the comparison with mGBA's frame", () => {
  const ours = new Uint16Array(240 * 160).fill(rgb(31, 0, 0))

  it('counts the differing pixels per line', () => {
    ours[5 * 240 + 3] = rgb(0, 31, 0)
    ours[5 * 240 + 4] = rgb(0, 31, 0)
    ours[9 * 240] = rgb(0, 0, 1)
    const diff = diffFrame(
      ours,
      linesFrame(() => rgb(31, 0, 0)),
    )
    expect(diff).toEqual({
      pixels: 3,
      lines: [
        { line: 5, pixels: 2 },
        { line: 9, pixels: 1 },
      ],
    })
  })

  it('takes the expected colour of each pixel from the trace when there is one', () => {
    const trace = new Uint8Array(240 * 160 * 8)
    const view = new DataView(trace.buffer)
    for (let i = 0; i < 240 * 160; i++) view.setUint16(8 * i, rgb(31, 0, 0), true)
    view.setUint16(8 * 7, rgb(0, 31, 0), true)
    const diff = diffFrame(
      new Uint16Array(240 * 160).fill(rgb(31, 0, 0)),
      linesFrame(() => rgb(31, 0, 0)),
      trace,
    )
    expect(diff.pixels).toBe(1)
  })

  it("holds our drawn pixel against GBATEK's result of its trace, whatever mGBA shows", () => {
    // A blend that returns the top colour unchanged: mGBA's frame shows the blend of the trace,
    // and the trace names the right layers, so only the drawn pixel is wrong.
    const traced = { top: rgb(31, 0, 0), below: rgb(0, 0, 31), effect: 1, eva: 8, evb: 8, evy: 0 }
    const trace = new Uint8Array(240 * 160 * 8)
    const view = new DataView(trace.buffer)
    for (let i = 0; i < 240 * 160; i++) view.setUint16(8 * i, rgb(31, 0, 0), true)
    view.setUint16(8 * 7, traced.top, true)
    view.setUint16(8 * 7 + 2, traced.below, true)
    trace.set([traced.effect, traced.eva, traced.evb, traced.evy], 8 * 7 + 4)
    const theirs = linesFrame(() => rgb(31, 0, 0))
    const blended = mgbaRgb(traced)
    theirs.rgb.set([blended >> 16, (blended >> 8) & 0xff, blended & 0xff], 3 * 7)
    const drawn = new Uint16Array(240 * 160).fill(rgb(31, 0, 0))
    expect(diffFrame(drawn, theirs, trace)).toEqual({
      pixels: 1,
      lines: [{ line: 0, pixels: 1 }],
      offTrace: 1,
    })
    const right = drawn.slice()
    right[7] = rgb(15, 0, 15)
    expect(diffFrame(right, theirs, trace)).toEqual({ pixels: 0, lines: [], offTrace: 0 })
  })

  it('refuses a frame that is not 240x160', () => {
    expect(() => diffFrame(ours, { width: 1, height: 1, rgb: new Uint8Array(3) })).toThrow(/1x1/)
  })

  it('puts ours left of mGBA in a PPM twice as wide', () => {
    const ppm = sideBySide(
      new Uint16Array(240 * 160),
      linesFrame(() => rgb(31, 31, 31)),
    )
    const header = 'P6\n480 160\n255\n'
    expect(new TextDecoder().decode(ppm.subarray(0, header.length))).toBe(header)
    expect(Array.from(ppm.subarray(header.length, header.length + 3))).toEqual([0, 0, 0])
    const right = header.length + 240 * 3
    expect(Array.from(ppm.subarray(right, right + 3))).toEqual([255, 255, 255])
  })
})

describe('the oracle run', () => {
  it('plays hand-made and 994052 every 60 frames unless told otherwise', () => {
    expect(parseOracleArgs([])).toEqual({ streams: ['hand-made', '994052'], every: 60 })
    expect(parseOracleArgs(['994052', '--every', '30'])).toEqual({ streams: ['994052'], every: 30 })
    expect(() => parseOracleArgs(['--every', '0'])).toThrow(/whole number/)
  })

  it('finds the states of a dump in frame order', () => {
    const files = ['frame-120.ppm', 'state-120.bin', 'state-60.bin', 'report.json']
    expect(stateFrames(files)).toEqual([60, 120])
  })

  it('counts equal frames for both pairings and lists the differing ones with their off-trace pixels', () => {
    const equal = { pixels: 0, lines: [] }
    const off = { pixels: 4, lines: [{ line: 7, pixels: 4 }], offTrace: 3 }
    const report = summarize('s', [
      { frame: 60, same: equal, next: off },
      { frame: 120, same: off, next: equal },
      { frame: 180, same: equal },
    ])
    expect(report).toEqual({
      name: 's',
      states: 3,
      equal: { same: 2, next: 1 },
      differing: [{ frame: 120, pixels: 4, lines: 1, firstLine: 7, offTrace: 3 }],
    })
  })
})
