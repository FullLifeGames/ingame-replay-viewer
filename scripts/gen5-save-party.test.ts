import { describe, expect, it } from 'vitest'

import { pkmField, pkmLayout, sealPkm } from '../src/gen5/pkm-cipher'
import { PKM } from '../src/gen5/pkm.fixtures'
import { firstSavePkm, partiesIn } from './gen5-save-party'

// Every size and offset here is invented (src/gen5/pkm.fixtures.ts): a PokeParty of 480 bytes
// with count at 0, capacity at 4, slotExists at 8 and pkms at 12, a party of three, a PartyPkm of 156 bytes.

const PARTY_AT = 0x40
const SIZE = pkmLayout(PKM, 'PartyPkm').size

/** An invented Pokémon: empty plain bytes but for its PID, sealed by the invented cipher. */
function sealed(pid: number): Uint8Array {
  const plain = new Uint8Array(SIZE)
  new DataView(plain.buffer).setUint32(pkmField(PKM, 'PartyPkm', 'base.pid').offset, pid, true)
  return sealPkm(plain, PKM)
}

/** A save of 2 KB with a party of one at PARTY_AT. */
function saveWith(pkm: Uint8Array, capacity = 3): Uint8Array {
  const bytes = new Uint8Array(0x800)
  const view = new DataView(bytes.buffer)
  view.setInt32(PARTY_AT + pkmField(PKM, 'PokeParty', 'capacity').offset, capacity, true)
  view.setInt32(PARTY_AT + pkmField(PKM, 'PokeParty', 'count').offset, 1, true)
  bytes.set(pkm, PARTY_AT + pkmField(PKM, 'PokeParty', 'pkms').offset)
  return bytes
}

// Scene: the spec on the tracked save finds its party and opens its first Pokémon.
describe('the save party', () => {
  const tepig = sealed(0x1234_5678)

  it('finds the party where capacity, count and the first checksum hold', () => {
    expect(partiesIn(saveWith(tepig), PKM)).toEqual([PARTY_AT])
    expect(partiesIn(saveWith(tepig, 4), PKM)).toEqual([])
  })

  it('gives the first Pokémon sealed as the save holds it', () => {
    expect([...firstSavePkm(saveWith(tepig), PKM)]).toEqual([...tepig])
  })

  it('throws on a save that holds no party', () => {
    expect(() => firstSavePkm(new Uint8Array(0x800), PKM)).toThrow('the save holds no party')
  })
})
