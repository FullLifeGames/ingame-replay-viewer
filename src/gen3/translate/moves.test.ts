import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

const EARTHQUAKE = moveOf('Earthquake').number
const earthquake = '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar'

describe('moves', () => {
  it('plays a critical super effective hit in the engine order (X5)', () => {
    const scene = sceneOf(
      earthquake,
      '|-crit|p2a: Tyranitar',
      '|-supereffective|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|10/100',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      { op: 'move', user: 'near', target: 'far', move: EARTHQUAKE },
      { op: 'hit', side: 'far', effectiveness: 'super' },
      { op: 'hp', side: 'far', hp: 10 },
      'A critical hit!',
      "It's super effective!",
    ])
  })

  it('plays no animation for a miss (X6)', () => {
    const scene = sceneOf(`${earthquake}|[miss]`, '|-miss|p1a: Dugtrio|p2a: Tyranitar')
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      'The opposing Tyranitar avoided the attack!',
    ])
  })

  it('plays no animation for a still move or one without a target', () => {
    expect(sceneOf(`${earthquake}|[still]`).map(plain)).toEqual(['Dugtrio used Earthquake!'])
    const alone = '|move|p1a: Dugtrio|Earthquake||[notarget]'
    expect(sceneOf(alone).map(plain)).toEqual(['Dugtrio used Earthquake!'])
  })

  it('aims a move on the user at its own side, and a far move at the near side', () => {
    const swordsDance = moveOf('Swords Dance').number
    const rockSlide = moveOf('Rock Slide').number
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Swords Dance|p1a: Dugtrio',
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Swords Dance!',
      { op: 'move', user: 'near', target: 'near', move: swordsDance },
      'The opposing Tyranitar used Rock Slide!',
      { op: 'move', user: 'far', target: 'near', move: rockSlide },
    ])
  })

  it('lists a move the expansion lacks with the move it plays', () => {
    const result = streamOfLog('|move|p2a: Tyranitar|Paleo Wave|p1a: Dugtrio')
    expect(result.fallbacks).toEqual([{ line: NEXT, ...moveOf('Paleo Wave').fallback }])
    expect(result.instructions[7]?.instruction).toEqual({
      op: 'move',
      user: 'far',
      target: 'near',
      move: moveOf('Paleo Wave').number,
    })
  })
})

describe('move results', () => {
  it('words an immunity, a failure, and a crit or resistance no hit took', () => {
    const scene = sceneOf(
      '|-immune|p1a: Dugtrio',
      '|-fail|p2a: Tyranitar',
      '|-crit|p2a: Tyranitar',
      '|-resisted|p2a: Tyranitar',
    )
    expect(scene.map(plain)).toEqual([
      "It doesn't affect Dugtrio…",
      'But it failed!',
      'A critical hit!',
      "It's not very effective…",
    ])
  })
})
