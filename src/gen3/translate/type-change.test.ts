import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, popUp, sceneOf, streamOfLog } from '../testing'

// `BattleScript_ProteanActivates` of the expansion: the ability's pop-up, then
// STRINGID_PKMNCHANGEDTYPE with the holder as B_ATK and the type as B_BUFF1. The expansion says it
// before the move's line; the log puts it after, and the scene keeps the log's order (D18).
describe('a type change by an ability (#88)', () => {
  it.each(['Libero', 'Protean'])('says the change %s makes inside its pop-up', (ability) => {
    const lines = [
      '|move|p2a: Tyranitar|Bug Bite|p1a: Dugtrio',
      `|-start|p2a: Tyranitar|typechange|Bug|[from] ability: ${ability}`,
    ]
    expect(sceneOf(...lines).map(plain)).toEqual([
      'The opposing Tyranitar used Bug Bite!',
      { op: 'move', user: 'far', target: 'near', move: moveOf('Bug Bite').number, animTurn: 0 },
      popUp('far', ability, true),
      'The opposing Tyranitar transformed into the Bug type!',
      popUp('far', ability, false),
    ])
    expect(streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  it('names the type of the line on the near side', () => {
    const scene = sceneOf('|-start|p1a: Dugtrio|typechange|Dark|[from] ability: Libero')
    expect(scene.map(plain)[1]).toBe('Dugtrio transformed into the Dark type!')
  })
})
