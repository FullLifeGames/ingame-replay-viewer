import { describe, expect, it } from 'vitest'

import type { ScriptEvent } from '../../script/events.ts'
import type { Side } from '../../script/types.ts'
import type { MonIds } from '../bw2-numbers.ts'
import { byParkSide, monIdOf, PARK_SIDES, partyOrder, partySlot } from './slots.ts'

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

// Scene: Team Preview lists each team before the battle, so a member's index follows the preview;
// the game sends out slot 0 first, so the lead takes it, and the rest follow by first switch-in.
describe('a battle script’s Pokémon in the park', () => {
  const member = (species: string) => ({ species, name: species, level: 100, shiny: false })
  const switchIn = (line: number, side: Side, index: number): ScriptEvent => ({
    kind: 'switchIn',
    line,
    who: { side, index },
    dragged: false,
    hp: { hp: 100, max: 100 },
  })
  const SCRIPT = {
    teams: {
      near: ['Ferrothorn', 'Keldeo', 'Politoed', 'Scizor'].map(member),
      far: ['Ninetales', 'Starmie'].map(member),
    },
    events: [
      switchIn(1, 'near', 2),
      switchIn(2, 'far', 1),
      switchIn(3, 'near', 3),
      switchIn(4, 'near', 2),
    ],
  }

  it('puts the lead in slot 0, the rest by first switch-in, then those never sent out', () => {
    expect(partyOrder(SCRIPT)).toEqual({ near: [2, 3, 0, 1], far: [1, 0] })
  })

  it('gives each Pokémon its slot in that order', () => {
    const order = partyOrder(SCRIPT)
    expect(partySlot(order, { side: 'near', index: 2 })).toBe(0)
    expect(partySlot(order, { side: 'near', index: 1 })).toBe(3)
    expect(partySlot(order, { side: 'far', index: 0 })).toBe(1)
    expect(() => partySlot(order, { side: 'far', index: 2 })).toThrow(
      'no far Pokémon 2 in the party',
    )
  })

  it('takes the near side to the player and the far side to the opponent', () => {
    expect(PARK_SIDES).toEqual({ near: 'player', far: 'opponent' })
    expect(byParkSide((side) => `${side} side`)).toEqual({
      player: 'near side',
      opponent: 'far side',
    })
  })
})
