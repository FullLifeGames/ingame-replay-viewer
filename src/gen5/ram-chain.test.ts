import { describe, expect, it } from 'vitest'

import { chainAddress, chainStep } from './ram-chain'

// Every address, offset and size in this spec is invented; none comes from the game.

/** A word reader over a map of words, 0 elsewhere, that keeps the addresses it read. */
function reader(known: Record<number, number>) {
  const reads: number[] = []
  const readWord = (address: number) => {
    reads.push(address)
    return known[address] ?? 0
  }
  return { reads, readWord }
}

// Scene: the page knows only a fixed word that points at a heap object; the opponent's name sits
// behind it, then behind the trainer, then behind its string buffer.
describe('chainAddress', () => {
  it('gives the fixed address itself for no hop, and reads nothing', () => {
    const { reads, readWord } = reader({})
    expect(chainAddress('flag', { address: 0x02100000 }, 4, readWord)).toEqual({
      address: 0x02100000,
    })
    expect(chainAddress('flag', { address: 0x02100000, hops: [] }, 4, readWord)).toEqual({
      address: 0x02100000,
    })
    expect(reads).toEqual([])
  })

  it('reads the base word for one hop and adds the offset', () => {
    const { reads, readWord } = reader({ 0x02100000: 0x02200000 })
    const chain = { address: 0x02100000, hops: [0x24] }
    expect(chainAddress('field', chain, 2, readWord)).toEqual({ address: 0x02200024 })
    expect(reads).toEqual([0x02100000])
  })

  it('reads three words in order for three hops', () => {
    const { reads, readWord } = reader({
      0x02100000: 0x02200000,
      0x02200010: 0x02300000,
      0x02300008: 0x02380000,
    })
    const chain = { address: 0x02100000, hops: [0x10, 0x08, 0x0c] }
    expect(chainAddress('name', chain, 16, readWord)).toEqual({ address: 0x0238000c })
    expect(reads).toEqual([0x02100000, 0x02200010, 0x02300008])
  })

  it('names the hop whose pointer leads out of main RAM, and no address', () => {
    const { reads, readWord } = reader({ 0x02100000: 0x09000000, 0x02100004: 0x02200000 })
    expect(chainAddress('setup', { address: 0x02100000, hops: [0] }, 4, readWord)).toEqual({
      fault: 'setup: hop 0 leads out of main RAM',
    })
    const nullSecond = { address: 0x02100004, hops: [0x10, 0x04] }
    expect(chainAddress('trainer', nullSecond, 4, readWord)).toEqual({
      fault: 'trainer: hop 1 leads out of main RAM',
    })
    expect(reads).toEqual([0x02100000, 0x02100004, 0x02200010])
  })

  it("fails a pointer at main RAM's last bytes when what follows runs past its end", () => {
    const { readWord } = reader({ 0x02100000: 0x023ffffc })
    const last = { address: 0x02100000, hops: [0] }
    expect(chainAddress('word', last, 4, readWord)).toEqual({ address: 0x023ffffc })
    expect(chainAddress('bytes', last, 8, readWord)).toEqual({
      fault: 'bytes: hop 0 leads out of main RAM',
    })
    const then = { address: 0x02100000, hops: [2, 0] }
    expect(chainAddress('pointer', then, 1, readWord)).toEqual({
      fault: 'pointer: hop 0 leads out of main RAM',
    })
  })

  it('fails a fixed address outside main RAM before it reads', () => {
    const { reads, readWord } = reader({})
    expect(chainAddress('far', { address: 0x01000000, hops: [0] }, 4, readWord)).toEqual({
      fault: 'far: its address lies outside main RAM',
    })
    expect(chainAddress('edge', { address: 0x023ffffe }, 4, readWord)).toEqual({
      fault: 'edge: its address lies outside main RAM',
    })
    expect(reads).toEqual([])
  })
})

// Scene: the route's script reads through the page one word at a time and awaits each, so it
// asks the chain for the next address to read.
describe('chainStep', () => {
  it('asks for each pointer in turn, then gives the end', () => {
    const chain = { address: 0x02100000, hops: [0x10, 0x04] }
    expect(chainStep('x', chain, 4, [])).toEqual({ read: 0x02100000 })
    expect(chainStep('x', chain, 4, [0x02200000])).toEqual({ read: 0x02200010 })
    expect(chainStep('x', chain, 4, [0x02200000, 0x02300000])).toEqual({ address: 0x02300004 })
  })
})
