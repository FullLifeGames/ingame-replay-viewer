import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { itemOf, moveOf } from '../tables/lookup'
import { plain, streamOfLog } from '../testing'

const held = (side: 'near' | 'far', item: string) => ({
  op: 'item',
  side,
  slot: 0,
  item: itemOf(item).number,
})

// The expansion's `BattleScript_EffectTrick`: the animation, STRINGID_PKMNSWITCHEDITEMS with the
// user as B_ATK, then `gItemSwapStringIds`, which the two `-item` lines say.
describe('Trick', () => {
  it('switches the items in the order of the expansion, with no line of ours', () => {
    const result = streamOfLog(
      '|move|p1a: Dugtrio|Trick|p2a: Tyranitar',
      '|-activate|p1a: Dugtrio|move: Trick|[of] p2a: Tyranitar',
      '|-item|p2a: Tyranitar|Choice Scarf|[from] move: Trick',
      '|-item|p1a: Dugtrio|Leftovers|[from] move: Trick',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      'Dugtrio used Trick!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Trick').number, animTurn: 0 },
      'Dugtrio switched items with its target!',
      held('far', 'Choice Scarf'),
      'The opposing Tyranitar obtained Choice Scarf.',
      held('near', 'Leftovers'),
      'Dugtrio obtained Leftovers.',
      { op: 'end', outcome: 'unknown' },
    ])
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })
})
