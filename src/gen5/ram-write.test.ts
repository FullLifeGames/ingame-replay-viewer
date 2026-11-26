import { describe, expect, it } from 'vitest'

import { type MemoryWrite, wordWrites, type WordWrites } from './ram-write'

// Every address, offset and size in this spec is invented; none comes from the game.

/** A word reader over a map of aligned words, 0 elsewhere. */
const words = (known: Record<number, number>) => (address: number) => known[address] ?? 0
/** The words as `address=value`, or the fault alone. */
const shown = (result: WordWrites) =>
  'fault' in result
    ? [result.fault]
    : result.words.map(({ address, value }) => `${address.toString(16)}=${value.toString(16)}`)

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

  // Scene: the park writes reach the setup through the pointer the routine leaves in its block.
  it('reads the base word, then writes at the base plus the offset', () => {
    const reads: number[] = []
    const read = (address: number) => {
      reads.push(address)
      return { 0x02100000: 0x02200000, 0x02200010: 0x11223344 }[address] ?? 0
    }
    const write: MemoryWrite = {
      kind: 'bytes',
      field: 'battleStyle',
      address: 0x02100000,
      hops: [0x12],
      bytes: [0x01],
    }
    expect(shown(wordWrites(write, read))).toEqual(['2200010=11013344'])
    expect(reads).toEqual([0x02100000, 0x02200010])
  })

  it('writes bits behind two pointers', () => {
    const read = words({ 0x02100000: 0x02200000, 0x02200008: 0x02300000, 0x02300004: 0xff })
    const write: MemoryWrite = {
      kind: 'bits',
      field: 'textSpeed',
      address: 0x02100000,
      hops: [0x08, 0x04],
      mask: 0x0f,
      value: 0x02,
    }
    expect(shown(wordWrites(write, read))).toEqual(['2300004=f2'])
  })

  it('gives the failing hop and no word for a base outside main RAM', () => {
    const write: MemoryWrite = {
      kind: 'bytes',
      field: 'name',
      address: 0x02100000,
      hops: [0],
      bytes: [1, 2],
    }
    expect(shown(wordWrites(write, words({ 0x02100000: 0 })))).toEqual([
      'name: hop 0 leads out of main RAM',
    ])
    const last = words({ 0x02100000: 0x023ffffe })
    expect(shown(wordWrites({ ...write, bytes: [1, 2, 3] }, last))).toEqual([
      'name: hop 0 leads out of main RAM',
    ])
    expect(shown(wordWrites(write, last))).toEqual(['23ffffc=2010000'])
  })
})

// Scene: the first run copies the save's first Pokémon from the player's party into the
// opponent's; both parties sit behind pointers, and the copy must leave its neighbours alone.
describe('wordWrites of a copy', () => {
  const copy = (length: number, from: number, to: number): MemoryWrite => ({
    kind: 'copy',
    field: 'lead',
    from: { address: 0x02100000, hops: [from] },
    to: { address: 0x02100004, hops: [to] },
    length,
  })
  const ram = {
    0x02100000: 0x02200000,
    0x02100004: 0x02300000,
    0x02200000: 0x44332211,
    0x02200004: 0x88776655,
    0x02300000: 0xaaaaaaaa,
    0x02300004: 0xbbbbbbbb,
    0x02300008: 0xcccccccc,
  }

  it('copies the bytes word by word', () => {
    expect(shown(wordWrites(copy(8, 0, 0), words(ram)))).toEqual([
      '2300000=44332211',
      '2300004=88776655',
    ])
  })

  it('keeps the neighbours of an unaligned start and end', () => {
    expect(shown(wordWrites(copy(4, 1, 3), words(ram)))).toEqual([
      '2300000=22aaaaaa',
      '2300004=bb554433',
    ])
  })

  it('refuses a source and destination that overlap, and copies beside each other', () => {
    const near = { ...ram, 0x02100004: 0x02200000 }
    expect(shown(wordWrites(copy(4, 0, 2), words(near)))).toEqual([
      'lead: its source and destination overlap',
    ])
    expect(shown(wordWrites(copy(2, 0, 2), words(near)))).toEqual(['2200000=22112211'])
  })

  it('writes nothing when a hop fails on either side', () => {
    expect(shown(wordWrites(copy(4, 0, 0), words({ ...ram, 0x02100000: 1 })))).toEqual([
      'lead from: hop 0 leads out of main RAM',
    ])
    expect(shown(wordWrites(copy(4, 0, 0), words({ ...ram, 0x02100004: 0 })))).toEqual([
      'lead to: hop 0 leads out of main RAM',
    ])
  })

  it('refuses a length that is no count of bytes', () => {
    expect(() => wordWrites(copy(0, 0, 0), words(ram))).toThrow(/lead/)
    expect(() => wordWrites(copy(1.5, 0, 0), words(ram))).toThrow(/lead/)
  })
})
