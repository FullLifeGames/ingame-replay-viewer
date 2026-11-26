import { describe, expect, it } from 'vitest'

import { ENTRY } from './direct-entry.fixtures'
import { entryAddress, entryCall, entryConstant, entryField, entryLayout } from './entry-field'

// The entry is invented (direct-entry.fixtures.ts).

// Scene: a plan never writes through a number the generator did not give; it names the gap.
describe('the entry lookups', () => {
  it('give what the entry holds', () => {
    expect(entryLayout(ENTRY, 'StrBuf').size).toBe(12)
    expect(entryField(ENTRY, 'StrBuf', 'length')).toEqual({ offset: 2, size: 2 })
    expect(entryConstant(ENTRY, 'HEAPID_USER')).toBe(7)
    expect(entryAddress(ENTRY, 'sGameProcManager')).toBe(0x02110000)
    expect(entryCall(ENTRY, 'GameData_Create')).toBe(0x02004201)
  })

  it('throw with the name they miss', () => {
    expect(() => entryLayout(ENTRY, 'Kite')).toThrow('the entry has no layout Kite')
    expect(() => entryField(ENTRY, 'StrBuf', 'tail')).toThrow(
      "the entry's StrBuf has no member tail",
    )
    expect(() => entryConstant(ENTRY, 'HEAPID_KITE')).toThrow(
      'the entry has no constant HEAPID_KITE',
    )
    expect(() => entryAddress(ENTRY, 'sKite')).toThrow('the entry has no data sKite')
    expect(() => entryCall(ENTRY, 'Kite_Fly')).toThrow('the entry has no function Kite_Fly')
  })
})
