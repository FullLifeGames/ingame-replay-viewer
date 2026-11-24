// Partial traps (#16): Wrap, Fire Spin and the other moves that trap and hurt each turn, as the
// pinned expansion plays them. The hit says the move's start line (`gWrappedStringIds`); each turn
// plays the trap's animation with the trapping move (`BattleScript_WrapTurnDmg`), says the damage,
// then moves the bar; the end says the Pokémon was freed (`BattleScript_WrapEnds`).
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import type { Side } from '../../script/types'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

const move = (name: string, user: Side, target: Side) => ({
  op: 'move',
  user,
  target,
  move: moveOf(name).number,
  animTurn: 0,
})
const hit = (side: Side) => ({ op: 'hit', side, effectiveness: 'normal' })
const hp = (side: Side, value: number) => ({ op: 'hp', side, hp: value })
const trapTurn = (side: Side, name: string) => ({
  op: 'trapTurn',
  side,
  move: moveOf(name).number,
})

const FIRE_SPIN = [
  '|move|p1a: Dugtrio|Fire Spin|p2a: Tyranitar',
  '|-damage|p2a: Tyranitar|90/100',
  '|-activate|p2a: Tyranitar|move: Fire Spin|[of] p1a: Dugtrio',
  '|-damage|p2a: Tyranitar|84/100|[from] move: Fire Spin|[partiallytrapped]',
  '|-end|p2a: Tyranitar|Fire Spin|[partiallytrapped]',
]

describe('a partial trap', () => {
  it('starts with its line after the hit, hurts each turn after its animation, then ends', () => {
    expect(sceneOf(...FIRE_SPIN).map(plain)).toEqual([
      'Dugtrio used Fire Spin!',
      move('Fire Spin', 'near', 'far'),
      hit('far'),
      hp('far', 90),
      'The opposing Tyranitar became trapped in the vortex!',
      trapTurn('far', 'Fire Spin'),
      'The opposing Tyranitar is hurt by Fire Spin!',
      hp('far', 84),
      'The opposing Tyranitar was freed from Fire Spin!',
    ])
  })

  it('reads every line of the trap, with no fallback', () => {
    const result = streamOfLog(...FIRE_SPIN)
    expect(result.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  it('names the trapper of a Wrap from the far side', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Wrap|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|94/100',
      '|-activate|p1a: Dugtrio|move: Wrap|[of] p2a: Tyranitar',
      '|-damage|p1a: Dugtrio|88/100|[from] move: Wrap|[partiallytrapped]',
    )
    expect(scene.map(plain)).toEqual([
      'The opposing Tyranitar used Wrap!',
      move('Wrap', 'far', 'near'),
      hit('near'),
      hp('near', 94),
      'Dugtrio was wrapped by the opposing Tyranitar!',
      trapTurn('near', 'Wrap'),
      'Dugtrio is hurt by Wrap!',
      hp('near', 88),
    ])
  })

  it('names the trapper first for a Clamp', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Clamp|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|94/100',
      '|-activate|p1a: Dugtrio|move: Clamp|[of] p2a: Tyranitar',
    )
    expect(scene.map(plain).at(-1)).toBe('The opposing Tyranitar clamped down on Dugtrio!')
  })

  it('says nothing for an end whose trapper left, and notes the gap', () => {
    const result = streamOfLog('|-end|p2a: Tyranitar|Fire Spin|[partiallytrapped]|[silent]')
    expect(sceneOf('|-end|p2a: Tyranitar|Fire Spin|[partiallytrapped]|[silent]')).toEqual([])
    expect(result.fallbacks.filter(({ line }) => line >= NEXT).map(({ kind }) => kind)).toEqual([
      'mechanic',
    ])
  })
})
