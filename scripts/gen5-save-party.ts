// The party a save holds (#97): the places of a PokeParty in a save's bytes, found by its capacity,
// its count and the first Pokémon's checksum, and that Pokémon sealed as the save keeps it.
// scripts/gen5-pkm-real.test.ts reads the tracked save with it.
import type { PkmNumbers } from '../src/gen5/bw2-numbers.ts'
import { openPkm, pkmConstant, pkmField, pkmLayout } from '../src/gen5/pkm-cipher.ts'

/** Each place in `bytes` where a PokeParty of the party's capacity starts, its count in range and
 * its first Pokémon opening with a right checksum. */
export function partiesIn(bytes: Uint8Array, pkm: PkmNumbers): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const capacity = pkmField(pkm, 'PokeParty', 'capacity').offset
  const count = pkmField(pkm, 'PokeParty', 'count').offset
  const first = pkmField(pkm, 'PokeParty', 'pkms').offset
  const partySize = pkmConstant(pkm, 'PARTY_SIZE')
  const pkmSize = pkmLayout(pkm, 'PartyPkm').size
  const found: number[] = []
  for (let at = 0; at + pkmLayout(pkm, 'PokeParty').size <= bytes.length; at += 4) {
    const n = view.getInt32(at + count, true)
    if (view.getInt32(at + capacity, true) !== partySize || n < 1 || n > partySize) continue
    const sealed = bytes.subarray(at + first, at + first + pkmSize)
    if (openPkm(sealed, pkm).checksumRight) found.push(at)
  }
  return found
}

/** The first Pokémon of the save's first party, sealed as the save holds it. */
export function firstSavePkm(bytes: Uint8Array, pkm: PkmNumbers): Uint8Array {
  const [party] = partiesIn(bytes, pkm)
  if (party === undefined) throw new Error('the save holds no party')
  const at = party + pkmField(pkm, 'PokeParty', 'pkms').offset
  return bytes.slice(at, at + pkmLayout(pkm, 'PartyPkm').size)
}
