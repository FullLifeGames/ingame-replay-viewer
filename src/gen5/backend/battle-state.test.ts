import { describe, expect, it } from 'vitest'

import { refIn, scriptOf } from '../../script/testing.ts'
import { battleState } from './battle-state.ts'
import { REPLAY_NUMBERS } from './replay.fixtures.ts'

// The invented battle: the player's client 3 stands at position 0, the opponent's client 2 at
// position 1; client 3's mon IDs start at 40 and client 2's at 10.
const SCRIPT = scriptOf('|turn|1', '|switch|p1a: Skarmory|Skarmory, M|100/100')
const DUGTRIO = refIn(SCRIPT, 'near', 'Dugtrio')
const TYRANITAR = refIn(SCRIPT, 'far', 'Tyranitar')
const SKARMORY = refIn(SCRIPT, 'near', 'Skarmory')

// Scene: until switches play (#108), the game keeps each side's lead in place, whatever the log
// sends in.
describe('the Pokémon in place', () => {
  it('gives each lead its mon ID and its position, and no other Pokémon a place', () => {
    const state = battleState(SCRIPT, REPLAY_NUMBERS.battle)
    expect(state.inPlace(DUGTRIO)).toEqual({ monId: 40, pos: 0 })
    expect(state.inPlace(TYRANITAR)).toEqual({ monId: 10, pos: 1 })
    expect(state.inPlace(SKARMORY)).toBeUndefined()
  })
})

// Scene: the game holds every Pokémon at 100 of 100 and moves its HP by the log's HP on the
// scale of 100, each change from where the game stands.
describe('hpTo', () => {
  it('takes the game’s HP down or up to the logged HP on the scale, and gives nothing when it stays', () => {
    const state = battleState(SCRIPT, REPLAY_NUMBERS.battle)
    expect(state.hpTo(TYRANITAR, { hp: 60, max: 100 })).toEqual({
      command: 'SC_OP_SUBTRACT_HP',
      args: [10, 40],
    })
    expect(state.hpTo(TYRANITAR, { hp: 66, max: 100 })).toEqual({
      command: 'SC_OP_ADD_HP',
      args: [10, 6],
    })
    expect(state.hpTo(TYRANITAR, { hp: 66, max: 100 })).toBeUndefined()
    expect(state.hpTo(DUGTRIO, { hp: 205, max: 341 })).toEqual({
      command: 'SC_OP_SUBTRACT_HP',
      args: [40, 40],
    })
    expect(state.hpTo(SKARMORY, { hp: 1, max: 100 })).toEqual({
      command: 'SC_OP_SUBTRACT_HP',
      args: [41, 99],
    })
  })
})
