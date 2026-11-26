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
// Switcheroo runs the same script (EFFECT_TRICK). Showdown logs its activation as Trick's and its
// two items by Switcheroo (data/moves.ts, `switcheroo`).
describe('Trick and Switcheroo', () => {
  it.each(['Trick', 'Switcheroo'])(
    '%s switches the items in the order of the expansion, with no line of ours',
    (move) => {
      const result = streamOfLog(
        `|move|p1a: Dugtrio|${move}|p2a: Tyranitar`,
        '|-activate|p1a: Dugtrio|move: Trick|[of] p2a: Tyranitar',
        `|-item|p2a: Tyranitar|Choice Scarf|[from] move: ${move}`,
        `|-item|p1a: Dugtrio|Leftovers|[from] move: ${move}`,
      )
      const scene = result.instructions.filter(({ line }) => line >= NEXT)
      expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
        `Dugtrio used ${move}!`,
        { op: 'move', user: 'near', target: 'far', move: moveOf(move).number, animTurn: 0 },
        'Dugtrio switched items with its target!',
        held('far', 'Choice Scarf'),
        'The opposing Tyranitar obtained Choice Scarf.',
        held('near', 'Leftovers'),
        'Dugtrio obtained Leftovers.',
        { op: 'end', outcome: 'unknown' },
      ])
      expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
    },
  )
})
