import { describe, expect, it } from 'vitest'

import {
  changedValues,
  failingCheck,
  type RamCheck,
  maskedValue,
  type RamRef,
  refAddress,
  readRef,
  type ReadRam,
} from './ram-check'

// A small main RAM for the spec: a pointer at 0x02100000 to 0x02180000, where a byte holds 0x11
// (two 4-bit fields, 1 and 1) and a halfword at +2 holds 0x2b.
const WORDS = new Map<number, number>([
  [0x02100000, 0x02180000],
  [0x02100004, 0x09000000],
  [0x02100008, 0],
])
const BYTES = new Map<number, number>([
  [0x02180000, 0x11],
  [0x02180002, 0x2b],
])
const read: ReadRam = (address, width) =>
  (width === 4 ? WORDS.get(address) : BYTES.get(address)) ?? 0

const adapter = (name: string, offset: number, width: 1 | 2 | 4): RamRef => ({
  name,
  address: 0x02100000,
  offset,
  width,
})

// Scene: the route's script reads a ref through the page one word at a time, by the same rule.
describe('refAddress and maskedValue', () => {
  it('gives the address, or the pointer plus the offset while it stays in main RAM', () => {
    expect(refAddress({ name: 'plain', address: 0x02100000, width: 4 }, 0)).toBe(0x02100000)
    expect(refAddress(adapter('cmd', 2, 2), 0x02180000)).toBe(0x02180002)
    expect(refAddress(adapter('cmd', 2, 2), 0x023ffffe)).toBe(undefined)
    expect(refAddress(adapter('cmd', 2, 2), 0)).toBe(undefined)
  })

  it('keeps only the masked bits, as an unsigned number', () => {
    expect(maskedValue({ ...adapter('high', 0, 4), mask: 0xf0000000 }, 0xffffffff)).toBe(0xf0000000)
    expect(maskedValue(adapter('all', 0, 2), 0x1234)).toBe(0x1234)
  })
})

describe('readRef', () => {
  it('reads a value at an address, through a pointer, and under a mask', () => {
    expect(readRef({ name: 'word', address: 0x02100000, width: 4 }, read)).toBe(0x02180000)
    expect(readRef(adapter('cmd', 2, 2), read)).toBe(0x2b)
    expect(readRef({ ...adapter('low', 0, 1), mask: 0x0f }, read)).toBe(1)
  })

  it('gives undefined for a pointer outside main RAM or a null one', () => {
    expect(readRef({ name: 'far', address: 0x02100004, offset: 0, width: 1 }, read)).toBe(undefined)
    expect(readRef({ name: 'null', address: 0x02100008, offset: 0x10, width: 2 }, read)).toBe(
      undefined,
    )
  })
})

// Scene: the end of the route waits for a battle; a check that reads the wrong field must name
// the field and what it read, so the log says which offset was wrong.
describe('failingCheck', () => {
  const checks: RamCheck[] = [
    { name: 'mode', address: 0x02100008, width: 4, oneOf: [0] },
    { name: 'adapter', address: 0x02100000, width: 4, mainRamPointer: true },
    { ...adapter('returned', 0, 1), mask: 0x0f, oneOf: [0, 1] },
    { ...adapter('size', 2, 2), atMost: 1500 },
  ]

  it('gives undefined when every check holds', () => {
    expect(failingCheck(checks, read)).toBe(undefined)
  })

  it('names the first check that fails and what it read', () => {
    expect(failingCheck([{ ...adapter('cmd', 2, 2), oneOf: [3] }], read)).toBe(
      'cmd read 0x2b, not one of 0x3',
    )
    expect(failingCheck([{ ...adapter('size', 2, 2), atMost: 4 }], read)).toBe(
      'size read 0x2b, above 0x4',
    )
    expect(
      failingCheck([{ name: 'far', address: 0x02100004, width: 4, mainRamPointer: true }], read),
    ).toBe('far read 0x9000000, not a pointer into main RAM')
    expect(failingCheck([{ name: 'far', address: 0x02100004, offset: 0, width: 1 }], read)).toBe(
      'far: its pointer does not lead into main RAM',
    )
  })
})

// Scene: the log shows the adapter's fields as the battle starts, one line per frame that changed
// one, so a wrong offset shows as a field that never moves or moves at random.
describe('changedValues', () => {
  const refs: RamRef[] = [
    { name: 'cmd', address: 0x02100000, width: 2 },
    { name: 'size', address: 0x02100002, width: 2 },
  ]

  it('names each value that changed, and none when nothing did', () => {
    expect(changedValues(refs, [0x2b, 4], [3, 4])).toBe('cmd=0x3')
    expect(changedValues(refs, [undefined, 4], [3, undefined])).toBe('cmd=0x3 size=none')
    expect(changedValues(refs, [3, 4], [3, 4])).toBe('')
  })
})
