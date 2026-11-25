import { describe, expect, it } from 'vitest'

import { ORDER_MEMBERS, orderBytes, orderOffset, ROUTINE_STAGES } from './routine-order'

// Every value here is invented; none is a number of the game.
const invented = (): Record<string, number> =>
  Object.fromEntries(ORDER_MEMBERS.map((name, i) => [name, 0x11223300 + i]))

// Scene: the page lays out the block from named values, and the routine reads word by word.
describe('orderBytes', () => {
  it("puts each named value at its member's word, little-endian", () => {
    const bytes = orderBytes(invented())
    expect(bytes).toHaveLength(ORDER_MEMBERS.length * 4)
    const go = orderOffset('go')
    expect(bytes.slice(go, go + 4)).toEqual([0x01, 0x33, 0x22, 0x11])
    const setup = orderOffset('setup')
    expect(bytes.slice(setup, setup + 4)).toEqual([0x03, 0x33, 0x22, 0x11])
  })

  it("writes a negative value as its two's complement word", () => {
    const bytes = orderBytes({ ...invented(), battleOverlayId: -1 })
    const at = orderOffset('battleOverlayId')
    expect(bytes.slice(at, at + 4)).toEqual([0xff, 0xff, 0xff, 0xff])
  })

  it('throws on a missing name, an unknown name and a value no word holds', () => {
    const missing = invented()
    delete missing.bgmPlay
    expect(() => orderBytes(missing)).toThrow(/bgmPlay/)
    expect(() => orderBytes({ ...invented(), cheer: 1 })).toThrow(/cheer/)
    expect(() => orderBytes({ ...invented(), heapId: 2 ** 32 })).toThrow(/heapId/)
    expect(() => orderBytes({ ...invented(), heapId: -(2 ** 31) - 1 })).toThrow(/heapId/)
    expect(() => orderBytes({ ...invented(), heapId: 1.5 })).toThrow(/heapId/)
  })
})

describe('orderOffset', () => {
  it('counts four bytes a member, from the first', () => {
    expect(orderOffset(ORDER_MEMBERS[0])).toBe(0)
    expect(orderOffset('go')).toBe(4)
  })
})

// Scene: the page waits for parked before its writes, and reads a failed stage as the call that
// gave no pointer.
describe('ROUTINE_STAGES', () => {
  it('starts at none and gives every stage its own value', () => {
    expect(ROUTINE_STAGES.none).toBe(0)
    const values = Object.values(ROUTINE_STAGES)
    expect(new Set(values).size).toBe(values.length)
    expect(Object.keys(ROUTINE_STAGES)).toEqual(
      expect.arrayContaining(['started', 'parked', 'gone', 'noGameData', 'noSetup']),
    )
  })
})
