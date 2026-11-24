import { describe, expect, it } from 'vitest'

import { type MemoryWrite, wordWrites } from './ram-write'

/** A word reader over a map of aligned words, 0 elsewhere. */
const words = (known: Record<number, number>) => (address: number) => known[address] ?? 0
const shown = (list: { address: number; value: number }[]) =>
  list.map(({ address, value }) => `${address.toString(16)}=${value.toString(16)}`)

// Scene: the page reaches main RAM through 32-bit words only, and a write of a byte or of a few
// bits must leave its neighbours as the game left them.
describe('wordWrites', () => {
  it('replaces one byte inside a word and keeps the other three', () => {
    const write: MemoryWrite = {
      kind: 'bytes',
      field: 'state',
      address: 0x02134a1a,
      bytes: [0x00],
    }
    const read = words({ 0x02134a18: 0x0b_06_04_11 })
    expect(shown(wordWrites(write, read))).toEqual(['2134a18=b000411'])
  })

  it('spreads bytes across word boundaries, little-endian', () => {
    const write: MemoryWrite = {
      kind: 'bytes',
      field: 'sendCmd.data',
      address: 0x02000006,
      bytes: [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77],
    }
    const read = words({ 0x02000004: 0xaabbccdd, 0x0200000c: 0xffffffff })
    expect(shown(wordWrites(write, read))).toEqual([
      '2000004=2211ccdd',
      '2000008=66554433',
      '200000c=ffffff77',
    ])
  })

  it('sets only the masked bits of a byte', () => {
    const write: MemoryWrite = {
      kind: 'bits',
      field: 'returned',
      address: 0x02134a18,
      mask: 0x0f,
      value: 0,
    }
    const read = words({ 0x02134a18: 0x0b_00_00_51 })
    expect(shown(wordWrites(write, read))).toEqual(['2134a18=b000050'])
  })

  it('refuses a value outside its mask and a byte above 255', () => {
    const bits: MemoryWrite = { kind: 'bits', field: 'x', address: 0, mask: 0x0f, value: 0x10 }
    expect(() => wordWrites(bits, words({}))).toThrow(/x/)
    const bytes: MemoryWrite = { kind: 'bytes', field: 'y', address: 0, bytes: [256] }
    expect(() => wordWrites(bytes, words({}))).toThrow(/y/)
  })
})
