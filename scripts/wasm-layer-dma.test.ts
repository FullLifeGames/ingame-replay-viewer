// DMA and the IRQ hook of our platform layer (#43, plan B2), run natively in the host harness on
// a GBA address space of its own. Each scene follows GBATEK's "GBA DMA Transfers" and "GBA
// Interrupt Control". The harness's `dma` command runs a script of operations and returns what
// its reads saw, in order; its result counts the handler's calls (high half) and ORs their flags.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost, runLayer } from './wasm-layer.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-dma-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

// GBATEK "GBA DMA Transfers", DMAxCNT_H, shifted into the upper half of DmaSet's control word.
const DEST_DEC = 0x0020
const DEST_FIXED = 0x0040
const DEST_RELOAD = 0x0060
const SRC_DEC = 0x0080
const SRC_FIXED = 0x0100
const REPEAT = 0x0200
const WORDS = 0x0400
const VBLANK = 0x1000
const HBLANK = 0x2000
const SPECIAL = 0x3000
const IRQ = 0x4000
const ENABLE = 0x8000
const control = (high: number, count: number) => ((high << 16) | count) >>> 0

const EWRAM = 0x02000000
const IO = 0x04000000
const BG0HOFS = IO + 0x10
const FIFO_A = IO + 0xa0
const cntH = (channel: number) => IO + 0xba + channel * 12
const [IE, IF, IME] = [IO + 0x200, IO + 0x202, IO + 0x208]
const FLAG_DMA3 = 1 << 11

type Op = number[]
/** The bytes as little-endian words, the last one padded with zeros. */
const packed = (bytes: number[]) => {
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4)
  padded.set(bytes)
  return Array.from(new Uint32Array(padded.buffer))
}
const load = (address: number, bytes: number[]): Op => [1, address, bytes.length, ...packed(bytes)]
const dmaSet = (channel: number, src: number, dest: number, word: number): Op => [
  2,
  channel,
  src,
  dest,
  word,
]
const run = (timing: number): Op => [3, timing]
const write16 = (address: number, value: number): Op => [4, address, value]
const raise = (flag: number): Op => [5, flag]
const read = (address: number, length: number): Op => [6, address, length]

const halves = (values: readonly number[]) =>
  Array.from(new Uint8Array(Uint16Array.from(values).buffer))
const wordBytes = (values: readonly number[]) =>
  Array.from(new Uint8Array(Uint32Array.from(values).buffer))
const asHalves = (bytes: Uint8Array) => Array.from(new Uint16Array(bytes.slice().buffer))
const asWords = (bytes: Uint8Array) => Array.from(new Uint32Array(bytes.slice().buffer))

/** Runs a script; `reads` is the byte count its read operations return together. */
function script(ops: Op[], reads: number) {
  const words = ops.flat()
  const { result, dest } = runLayer(host, 'dma', {
    src: wordBytes(words),
    dest: new Uint8Array(reads),
  })
  return { calls: result >>> 16, flags: result & 0xffff, dest }
}

describe('an immediate DMA', () => {
  it('copies halfwords at once and clears its enable bit', () => {
    const { dest } = script(
      [
        load(EWRAM, halves([1, 2, 3, 4, 5])),
        dmaSet(3, EWRAM, EWRAM + 0x100, control(ENABLE, 4)),
        read(EWRAM + 0x100, 10),
        read(cntH(3), 2),
      ],
      12,
    )
    expect(asHalves(dest)).toEqual([1, 2, 3, 4, 0, 0])
  })

  it('fills words from a fixed source, as DmaFill32 sets it', () => {
    const { dest } = script(
      [
        load(EWRAM, wordBytes([0xcafef00d])),
        dmaSet(3, EWRAM, EWRAM + 0x100, control(ENABLE | WORDS | SRC_FIXED, 3)),
        read(EWRAM + 0x100, 16),
      ],
      16,
    )
    expect(asWords(dest)).toEqual([0xcafef00d, 0xcafef00d, 0xcafef00d, 0])
  })

  it('walks a decrementing destination down and keeps a fixed one in place', () => {
    const { dest } = script(
      [
        load(EWRAM, halves([1, 2, 3])),
        dmaSet(0, EWRAM, EWRAM + 0x104, control(ENABLE | DEST_DEC, 3)),
        dmaSet(1, EWRAM, EWRAM + 0x200, control(ENABLE | DEST_FIXED, 3)),
        dmaSet(2, EWRAM + 4, EWRAM + 0x300, control(ENABLE | SRC_DEC, 3)),
        read(EWRAM + 0x100, 6),
        read(EWRAM + 0x200, 4),
        read(EWRAM + 0x300, 6),
      ],
      16,
    )
    expect(asHalves(dest)).toEqual([3, 2, 1, 3, 0, 3, 2, 1])
  })

  it('takes a count of 0 as 0x4000 units, and as 0x10000 on DMA3', () => {
    const fill = (channel: number, at: number) =>
      dmaSet(channel, EWRAM, at, control(ENABLE | SRC_FIXED, 0))
    const { dest } = script(
      [
        load(EWRAM, halves([0x1111])),
        fill(0, EWRAM + 0x1000),
        fill(3, EWRAM + 0x20000),
        read(EWRAM + 0x1000 + 0x7ffe, 4),
        read(EWRAM + 0x20000 + 0x1fffe, 4),
      ],
      8,
    )
    expect(asHalves(dest)).toEqual([0x1111, 0, 0x1111, 0])
  })
})

describe('a timed DMA', () => {
  const hofs = (high: number) =>
    dmaSet(0, EWRAM, BG0HOFS, control(ENABLE | HBLANK | REPEAT | DEST_RELOAD | high, 1))
  const lines = [load(EWRAM, halves([7, 8, 9, 10]))]

  it('writes one register at each HBlank from the next source unit, with repeat and reload', () => {
    const ops = [...lines, hofs(0), read(BG0HOFS, 2)]
    for (let line = 0; line < 3; line++) ops.push(run(2), read(BG0HOFS, 2))
    expect(asHalves(script(ops, 8).dest)).toEqual([0, 7, 8, 9])
  })

  it('waits for its own timing', () => {
    const { dest } = script([...lines, hofs(0), run(0), run(1), run(3), read(BG0HOFS, 2)], 2)
    expect(asHalves(dest)).toEqual([0])
  })

  it('stops at a plain write to its control, and starts over from SAD at the next DmaSet', () => {
    const { dest } = script(
      [
        ...lines,
        hofs(0),
        run(2),
        write16(cntH(0), REPEAT | DEST_RELOAD | HBLANK),
        write16(BG0HOFS, 0),
        run(2),
        read(BG0HOFS, 2),
        hofs(0),
        run(2),
        read(BG0HOFS, 2),
      ],
      4,
    )
    expect(asHalves(dest)).toEqual([0, 7])
  })

  it('keeps its own pointers when DmaSet writes again while it is enabled', () => {
    const { dest } = script([...lines, hofs(0), run(2), hofs(0), run(2), read(BG0HOFS, 2)], 2)
    expect(asHalves(dest)).toEqual([8])
  })

  it('runs once at VBlank without repeat, then clears its enable bit', () => {
    const { dest } = script(
      [
        ...lines,
        dmaSet(3, EWRAM, EWRAM + 0x100, control(ENABLE | VBLANK, 2)),
        read(EWRAM + 0x100, 4),
        run(1),
        read(EWRAM + 0x100, 4),
        read(cntH(3), 2),
      ],
      10,
    )
    expect(asHalves(dest)).toEqual([0, 0, 7, 8, VBLANK])
  })

  it('never writes the sound FIFO: the mixer hands its samples to the host', () => {
    const fifo = control(ENABLE | SPECIAL | REPEAT | WORDS | DEST_FIXED, 4)
    const ops = [...lines, dmaSet(1, EWRAM, FIFO_A, fifo)]
    for (const timing of [0, 1, 2, 3]) ops.push(run(timing))
    const { dest } = script([...ops, read(FIFO_A, 4)], 4)
    expect(asWords(dest)).toEqual([0])
  })
})

describe('the end IRQ', () => {
  const ending = () => [
    load(EWRAM, halves([5])),
    dmaSet(3, EWRAM, EWRAM + 0x100, control(ENABLE | IRQ, 1)),
    read(IF, 2),
  ]

  it('reaches the handler with IE and IME set, which acknowledges it in IF', () => {
    const { calls, flags, dest } = script([write16(IE, FLAG_DMA3), write16(IME, 1), ...ending()], 2)
    expect([calls, flags, asHalves(dest)[0]]).toEqual([1, FLAG_DMA3, 0])
  })

  it('stays a request in IF while IME or IE holds it back', () => {
    const noIme = script([write16(IE, FLAG_DMA3), ...ending()], 2)
    const noIe = script([write16(IME, 1), ...ending()], 2)
    expect([noIme.calls, asHalves(noIme.dest)[0]]).toEqual([0, FLAG_DMA3])
    expect([noIe.calls, asHalves(noIe.dest)[0]]).toEqual([0, FLAG_DMA3])
  })

  it('is not raised without bit 14', () => {
    const { calls, dest } = script(
      [
        write16(IE, 0x3fff),
        write16(IME, 1),
        load(EWRAM, halves([5])),
        dmaSet(3, EWRAM, EWRAM + 0x100, control(ENABLE, 1)),
        read(IF, 2),
      ],
      2,
    )
    expect([calls, asHalves(dest)[0]]).toEqual([0, 0])
  })
})

describe('a raised IRQ', () => {
  it('calls the handler once per flag that IE and IME let through', () => {
    const { calls, flags } = script(
      [write16(IE, 0b101), write16(IME, 1), raise(1), raise(2), raise(4)],
      0,
    )
    expect([calls, flags]).toEqual([2, 0b101])
  })

  it('reads only bit 0 of IME', () => {
    const { calls } = script([write16(IE, 1), write16(IME, 2), raise(1)], 0)
    expect(calls).toBe(0)
  })
})
