import { describe, expect, it } from 'vitest'

import type { TextNumbers } from '../bw2-numbers.ts'
import { GEN5_LINES, lineId } from './lines.ts'

// Invented: two banks with the labels at line indices of their own.
const TEXT: TextNumbers = {
  standard: { Bank0019_Text_CriticalHit: 3, Bank0019_Text_ButFailed: 11 },
  set: { Bank0018_Text_AvoidedAttack: 7 },
}

// Scene: the backend sends a line by the index its label has in the generated file.
describe('lineId', () => {
  it("finds a label's index in its bank", () => {
    expect(lineId(TEXT, GEN5_LINES.critical)).toBe(3)
    expect(lineId(TEXT, GEN5_LINES.failed)).toBe(11)
    expect(lineId(TEXT, GEN5_LINES.avoided)).toBe(7)
  })

  it('names a label the generated file lacks', () => {
    expect(() => lineId(TEXT, GEN5_LINES.doesNotAffect)).toThrow(
      'bw2.json has no Bank0018_Text_DoesntAffect',
    )
  })

  it('looks in the bank the line names alone', () => {
    const swapped: TextNumbers = { standard: {}, set: { Bank0019_Text_CriticalHit: 3 } }
    expect(() => lineId(swapped, GEN5_LINES.critical)).toThrow(
      'bw2.json has no Bank0019_Text_CriticalHit',
    )
  })
})

// Scene: the game reads a standard line from 0019.txt and a set line from 0018.txt, so a label must
// come from the file of the bank its line names.
describe('GEN5_LINES', () => {
  it('labels each line from the bank it names', () => {
    const prefix = { standard: 'Bank0019_Text_', set: 'Bank0018_Text_' }
    const wrong = Object.entries(GEN5_LINES).filter(
      ([, line]) => !line.label.startsWith(prefix[line.bank]),
    )
    expect(wrong.map(([name]) => name)).toEqual([])
  })
})
