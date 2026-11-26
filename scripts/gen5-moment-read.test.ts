import { describe, expect, it } from 'vitest'

import type { PartyMonReading } from '../src/gen5/battle-mons'
import type { WrittenPkm } from '../src/gen5/pkm-fields'
import { partyLine } from './gen5-moment-read'

// Every number here is invented: three Pokémon as the park wrote them and as the battle read them.

const one = (species: number, item: number, ability: number) => ({
  species,
  level: 30,
  hp: 70,
  maxHp: 80,
  item,
  ability,
})
const WRITTEN = [one(10, 20, 3), one(11, 21, 4), one(12, 22, 5)].map(
  (mon) => mon as unknown as WrittenPkm,
)
const READ: PartyMonReading[] = [one(10, 20, 3), one(11, 21, 4), one(12, 22, 5)].map((mon, i) => ({
  ...mon,
  address: 0x02100000 + i * 0x100,
  monId: i,
}))

// Scene: a run without a save shows each side's whole party in the battle's copy, as written.
describe('partyLine', () => {
  it('says each side read as written', () => {
    expect(partyLine('near', READ, WRITTEN)).toBe('near party: 3 of 3 as written')
  })

  it('names what differs, what the battle lacks and what it holds beyond the party written', () => {
    const changed = READ.map((mon, i) => (i === 1 ? { ...mon, item: 0, hp: 1 } : mon))
    expect(partyLine('far', changed.slice(0, 2), WRITTEN)).toBe(
      'far party: 1 of 3 as written; pkms[1] differs in hp, item; pkms[2] is not in the battle',
    )
    expect(partyLine('near', [...READ, READ[0] as PartyMonReading], WRITTEN)).toBe(
      'near party: 3 of 3 as written; pkms[3] was not written',
    )
  })

  it('counts the party read when nothing was written, as on the walk', () => {
    expect(partyLine('near', READ, undefined)).toBe('near party: 3 read')
  })
})
