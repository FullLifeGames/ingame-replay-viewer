import { describe, expect, it } from 'vitest'

import { ENTRY, ROUTINE } from './direct-entry.fixtures'
import { partyChecks, partyCounts, partyWrites } from './direct-party'
import { takeover } from './direct-takeover'

// Every address, offset, size and constant here is invented (direct-entry.fixtures.ts): the
// setup's party pointers at 0x24 for the player (index 1) and 0x20 for the opponent (index 0),
// PokeParty's count at 0, capacity at 8, pkms at 0x10
// and slotExists at 0x250, a PartyPkm of 0x60 bytes, so five of them fill pkms.

const SETUP = 0x0230003c
const { layout } = takeover(ENTRY, ROUTINE)

/** An invented sealed Pokémon of PartyPkm's size, each byte from `seed`. */
const sealed = (seed: number) => Uint8Array.from({ length: 0x60 }, (_, i) => (seed + i) % 256)
const ONE = sealed(1)
const TWO = sealed(2)
const THREE = sealed(3)

// Scene: the park writes both sides' parties whole, as PokeParty_AddPkm leaves a party: the
// Pokémon one after another at pkms, the count, and a slot flag for each.
describe('partyWrites', () => {
  it("puts each side's Pokémon behind its client's party pointer, then the count and the slots", () => {
    const writes = partyWrites(ENTRY, layout, { player: [ONE, TWO], opponent: [THREE] })
    expect(writes).toEqual([
      {
        kind: 'bytes',
        field: 'player.party.pkms[0]',
        address: SETUP,
        hops: [0x24, 0x10],
        bytes: [...ONE],
      },
      {
        kind: 'bytes',
        field: 'player.party.pkms[1]',
        address: SETUP,
        hops: [0x24, 0x70],
        bytes: [...TWO],
      },
      {
        kind: 'bytes',
        field: 'player.party.count',
        address: SETUP,
        hops: [0x24, 0],
        bytes: [2, 0, 0, 0],
      },
      {
        kind: 'bytes',
        field: 'player.party.slotExists',
        address: SETUP,
        hops: [0x24, 0x250],
        bytes: [0b11],
      },
      {
        kind: 'bytes',
        field: 'opponent.party.pkms[0]',
        address: SETUP,
        hops: [0x20, 0x10],
        bytes: [...THREE],
      },
      {
        kind: 'bytes',
        field: 'opponent.party.count',
        address: SETUP,
        hops: [0x20, 0],
        bytes: [1, 0, 0, 0],
      },
      {
        kind: 'bytes',
        field: 'opponent.party.slotExists',
        address: SETUP,
        hops: [0x20, 0x250],
        bytes: [0b1],
      },
    ])
  })

  it('throws on a side above the capacity and names the side', () => {
    const six = Array.from({ length: 6 }, (_, i) => sealed(i))
    expect(() => partyWrites(ENTRY, layout, { player: [ONE], opponent: six })).toThrow(
      "the opponent's party holds more Pokémon than its capacity",
    )
  })

  it('throws on a side with no Pokémon and names the side', () => {
    expect(() => partyWrites(ENTRY, layout, { player: [], opponent: [ONE] })).toThrow(
      "the player's party holds no Pokémon",
    )
  })

  it('throws on a Pokémon that is not one PartyPkm long and names its slot', () => {
    const short = new Uint8Array(4)
    expect(() => partyWrites(ENTRY, layout, { player: [ONE, short], opponent: [ONE] })).toThrow(
      'player.party.pkms[1] is not one PartyPkm long',
    )
  })

  it('throws on a party room that holds no whole number of PartyPkm', () => {
    const odd = {
      ...ENTRY,
      layouts: { ...ENTRY.layouts, PartyPkm: { size: 0x70, align: 8, fields: {} } },
    }
    expect(() => partyWrites(odd, layout, { player: [ONE], opponent: [ONE] })).toThrow(
      'PokeParty.pkms holds no whole number of PartyPkm',
    )
  })
})

// Scene: with no save the player's party is empty when the routine parks; both parties have the
// room of a full party, and the opponent's holds no Pokémon yet.
describe('partyChecks', () => {
  it("checks both parties' capacity and the opponent's empty party, not the player's count", () => {
    expect(partyChecks(ENTRY, layout)).toEqual([
      {
        name: 'player.party.capacity',
        address: SETUP,
        hops: [0x24, 8],
        width: 4,
        oneOf: [5],
      },
      {
        name: 'opponent.party.capacity',
        address: SETUP,
        hops: [0x20, 8],
        width: 4,
        oneOf: [5],
      },
      { name: 'opponent.party.count', address: SETUP, hops: [0x20, 0], width: 4, oneOf: [0] },
    ])
  })
})

describe('partyCounts', () => {
  it('reads back the count written for each side', () => {
    expect(partyCounts(ENTRY, layout, { player: [ONE, TWO], opponent: [THREE] })).toEqual([
      { name: 'player.party.count', address: SETUP, hops: [0x24, 0], width: 4, oneOf: [2] },
      { name: 'opponent.party.count', address: SETUP, hops: [0x20, 0], width: 4, oneOf: [1] },
    ])
  })
})
