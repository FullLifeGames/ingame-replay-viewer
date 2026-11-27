import { describe, expect, it } from 'vitest'

import type { BattleScript } from '../../script/events.ts'
import { NEXT, refIn, scriptOf } from '../../script/testing.ts'
import { battleState } from './battle-state.ts'
import { REPLAY_NUMBERS } from './replay.fixtures.ts'
import type { EventOf } from './rules.ts'

// The invented battle: the player's client 3 stands at position 0, the opponent's client 2 at
// position 1; client 3's mon IDs start at 40 and client 2's at 10.
const SCRIPT = scriptOf('|turn|1', '|switch|p1a: Skarmory|Skarmory, M|100/100')
const DUGTRIO = refIn(SCRIPT, 'near', 'Dugtrio')
const TYRANITAR = refIn(SCRIPT, 'far', 'Tyranitar')
const SKARMORY = refIn(SCRIPT, 'near', 'Skarmory')

/** Alice sends in Skarmory, then Gengar, then Dugtrio again. Dugtrio, Skarmory and Gengar are
 * team indices 0, 1 and 2, sent in first in that order, so their mon IDs are 40, 41 and 42. */
const SWAPS = scriptOf(
  '|turn|1',
  '|switch|p1a: Skarmory|Skarmory, M|100/100',
  '|turn|2',
  '|switch|p1a: Gengar|Gengar, M|100/100',
  '|turn|3',
  '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
)
const GENGAR = refIn(SWAPS, 'near', 'Gengar')

/** Skarmory comes in and faints, Dugtrio takes the empty place, and a Skarmory comes in. The
 * script reads that one as a new team member: a log cannot send a fainted Pokémon in again. */
const FAINT = scriptOf(
  '|turn|1',
  '|switch|p1a: Skarmory|Skarmory, M|100/100',
  '|-damage|p1a: Skarmory|0 fnt',
  '|faint|p1a: Skarmory',
  '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
  '|turn|2',
  '|switch|p1a: Skarmory|Skarmory, M|100/100',
)

/** The switch-ins of `script` after the leads, in log order. */
function sendInsOf(script: BattleScript): EventOf<'switchIn'>[] {
  return script.events.filter(
    (event): event is EventOf<'switchIn'> => event.kind === 'switchIn' && event.line > NEXT,
  )
}

// Scene: at the battle's start the game holds each side's lead in place, the Pokémon in party
// slot 0.
describe('the Pokémon in place', () => {
  it('gives each lead its mon ID and its position, and no other Pokémon a place', () => {
    const state = battleState(SCRIPT, REPLAY_NUMBERS.battle)
    expect(state.inPlace(DUGTRIO)).toEqual({ monId: 40, pos: 0 })
    expect(state.inPlace(TYRANITAR)).toEqual({ monId: 10, pos: 1 })
    expect(state.inPlace(SKARMORY)).toBeUndefined()
  })

  it('refuses by name a Pokémon the game does not hold in place', () => {
    const state = battleState(SCRIPT, REPLAY_NUMBERS.battle)
    expect(state.placed(DUGTRIO, 12)).toEqual({ monId: 40, pos: 0 })
    expect(() => state.placed(SKARMORY, 12)).toThrow(
      new Error('line 12: the log names Skarmory, which the game does not hold in place'),
    )
    expect(() => state.placed({ side: 'far', index: 9 }, 12)).toThrow(
      new Error('line 12: the log names Pokémon 9, which the game does not hold in place'),
    )
  })
})

// Scene: each send-in swaps the front's party slot with the incoming Pokémon's, as
// BattleParty_Swap does, and every Pokémon keeps the mon ID of its start slot.
describe('three send-ins on one side', () => {
  it('give the party order by mon ID after each, and the Pokémon in place follows', () => {
    const state = battleState(SWAPS, REPLAY_NUMBERS.battle)
    const [skarmory, gengar, dugtrio] = sendInsOf(SWAPS)
    expect(state.partyMonIds('near')).toEqual([40, 41, 42])
    expect(skarmory && state.sendIn(skarmory)).toEqual({
      client: 3,
      slot: 1,
      out: { monId: 40, pos: 0, ref: DUGTRIO },
    })
    expect(state.partyMonIds('near')).toEqual([41, 40, 42])
    expect(state.inPlace(SKARMORY)).toEqual({ monId: 41, pos: 0 })
    expect(state.inPlace(DUGTRIO)).toBeUndefined()
    expect(gengar && state.sendIn(gengar)).toMatchObject({ slot: 2, out: { ref: SKARMORY } })
    expect(state.partyMonIds('near')).toEqual([42, 40, 41])
    expect(state.inPlace(GENGAR)).toEqual({ monId: 42, pos: 0 })
    expect(dugtrio && state.sendIn(dugtrio)).toMatchObject({ slot: 1, out: { ref: GENGAR } })
    expect(state.partyMonIds('near')).toEqual([40, 42, 41])
    expect(state.inPlace(DUGTRIO)).toEqual({ monId: 40, pos: 0 })
    expect(state.partyMonIds('far')).toEqual([10])
  })
})

// Scene: a fainted Pokémon keeps its place, at HP 0, until the next send-in, which sends
// nothing back.
describe('a faint', () => {
  it('takes the HP to 0 and leaves the place to the send-in, which sends nothing back', () => {
    const state = battleState(FAINT, REPLAY_NUMBERS.battle)
    const [skarmory, dugtrio] = sendInsOf(FAINT)
    if (skarmory) state.sendIn(skarmory)
    state.faint(SKARMORY)
    expect(state.hpOf(SKARMORY)).toBe(0)
    expect(state.hpOf(DUGTRIO)).toBe(100)
    expect(state.inPlace(SKARMORY)).toEqual({ monId: 41, pos: 0 })
    expect(dugtrio && state.sendIn(dugtrio)).toEqual({ client: 3, slot: 1 })
    expect(state.inPlace(DUGTRIO)).toEqual({ monId: 40, pos: 0 })
  })
})

// Scene: the log and the game's party disagree; the state refuses by line and species (lane
// plan D1).
describe('a send-in the game cannot follow', () => {
  const [skarmoryIn, afterFaint, again] = sendInsOf(FAINT)
  const at = (event: { line: number } | undefined) => `line ${String(event?.line)}`

  it('refuses a Pokémon the side’s party does not hold', () => {
    const state = battleState(SCRIPT, REPLAY_NUMBERS.battle)
    const nine = skarmoryIn && { ...skarmoryIn, who: { side: 'near' as const, index: 9 } }
    expect(() => nine && state.sendIn(nine)).toThrow(
      new Error(`${at(nine)}: the near side’s party holds no Pokémon 9`),
    )
  })

  it('refuses a Pokémon in place already', () => {
    const state = battleState(SCRIPT, REPLAY_NUMBERS.battle)
    const twice = skarmoryIn && { ...skarmoryIn, who: DUGTRIO }
    expect(() => twice && state.sendIn(twice)).toThrow(
      new Error(`${at(twice)}: the log sends in Dugtrio, which the game holds in place already`),
    )
  })

  it('refuses a Pokémon that fainted', () => {
    const state = battleState(FAINT, REPLAY_NUMBERS.battle)
    if (skarmoryIn) state.sendIn(skarmoryIn)
    state.faint(SKARMORY)
    const backAfterFaint = afterFaint && { ...afterFaint, replaces: SKARMORY }
    expect(() => backAfterFaint && state.sendIn(backAfterFaint)).toThrow(
      new Error(
        `${at(afterFaint)}: the log sends back Skarmory; the game holds Skarmory, which fainted`,
      ),
    )
    if (afterFaint) state.sendIn(afterFaint)
    const fainted = again && { ...again, who: SKARMORY }
    expect(() => fainted && state.sendIn(fainted)).toThrow(
      new Error(`${at(fainted)}: the log sends in Skarmory, which fainted`),
    )
  })

  it('refuses a Pokémon sent back that is not the one in place', () => {
    const state = battleState(SWAPS, REPLAY_NUMBERS.battle)
    const [, gengar] = sendInsOf(SWAPS)
    const offFront = gengar && { ...gengar, replaces: SKARMORY }
    expect(() => offFront && state.sendIn(offFront)).toThrow(
      new Error(`${at(offFront)}: the log sends back Skarmory; the game holds Dugtrio in place`),
    )
    const nothingBack = afterFaint && { ...afterFaint, who: SKARMORY }
    expect(() => nothingBack && state.sendIn(nothingBack)).toThrow(
      new Error(
        `${at(nothingBack)}: the log sends back no Pokémon; the game holds Dugtrio in place`,
      ),
    )
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
    expect(state.hpOf(TYRANITAR)).toBe(60)
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
