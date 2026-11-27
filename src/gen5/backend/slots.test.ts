import { describe, expect, it } from 'vitest'

import type { MonIds } from '../bw2-numbers.ts'
import { monIdOf, PARK_SIDES, partySlot } from './slots.ts'

// Invented: four clients whose ranges of mon IDs neither start at 0 nor follow the clients'
// order, eight IDs each. Client 1 stands for the far side's client.
const MON_IDS: MonIds = { firstByClient: [16, 40, 0, 24], perClient: 8 }

// Scene: a move of the far side's third Pokémon names its battler by mon ID.
describe('the mon ID of a client’s party slot', () => {
  it('counts from the client’s first ID', () => {
    expect(monIdOf(MON_IDS, 1, 2)).toBe(42)
    expect(monIdOf(MON_IDS, 2, 0)).toBe(0)
    expect(monIdOf(MON_IDS, 3, 7)).toBe(31)
  })

  it('refuses a slot past the client’s range and a client the battle lacks', () => {
    expect(() => monIdOf(MON_IDS, 1, 8)).toThrow('slot 8 lies outside client 1’s 8 mon IDs')
    expect(() => monIdOf(MON_IDS, 1, -1)).toThrow('slot -1 lies outside client 1’s 8 mon IDs')
    expect(() => monIdOf(MON_IDS, 1, 1.5)).toThrow('slot 1.5 lies outside client 1’s 8 mon IDs')
    expect(() => monIdOf(MON_IDS, 4, 0)).toThrow('the battle has no client 4')
  })
})

// Scene: the battle script names a Pokémon by side and index; the park writes parties by side.
describe('a battle script’s Pokémon in the park', () => {
  it('sits in the party slot of its index', () => {
    expect(partySlot({ side: 'far', index: 3 })).toBe(3)
    expect(partySlot({ side: 'near', index: 0 })).toBe(0)
  })

  it('takes the near side to the player and the far side to the opponent', () => {
    expect(PARK_SIDES).toEqual({ near: 'player', far: 'opponent' })
  })
})
