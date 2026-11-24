import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

const fallbacksOf = (...lines: string[]) =>
  streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)

// `resultmessage` says the one-hit KO after the hit's bar moves and before the faint
// (`MOVE_RESULT_ONE_HIT_KO`, src/battle_script_commands.c).
describe('a one-hit KO', () => {
  it('says so after the bar empties, before the faint', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Fissure|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|0 fnt',
      '|-ohko',
      '|faint|p2a: Tyranitar',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Fissure!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Fissure').number, animTurn: 0 },
      { op: 'hit', side: 'far', effectiveness: 'normal' },
      { op: 'hp', side: 'far', hp: 0 },
      "It's a one-hit KO!",
      { op: 'faint', side: 'far' },
      'The opposing Tyranitar fainted!',
    ])
  })
})

// The expansion says the move, then `CancelerNoTarget` runs `BattleScript_ButItFailed`
// (src/battle_move_resolution.c): no animation, then "But it failed!".
describe('a move without a target', () => {
  it('says the move, plays no animation and fails', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Earthquake||[notarget]',
      '|-notarget|p2a: Tyranitar',
    )
    expect(scene.map(plain)).toEqual(['The opposing Tyranitar used Earthquake!', 'But it failed!'])
  })

  it('fails the same way on the Gen 1 line that names no Pokémon', () => {
    const scene = sceneOf('|move|p2a: Tyranitar|Earthquake|p1a: Dugtrio|[notarget]', '|-notarget')
    expect(scene.map(plain)).toEqual(['The opposing Tyranitar used Earthquake!', 'But it failed!'])
    expect(fallbacksOf('|-notarget')).toEqual([])
  })
})
