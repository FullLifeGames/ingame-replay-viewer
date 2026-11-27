// What the Gen 3 backend makes of Gen 5's Frisk and Mummy lines (#117): the battle script gives
// Frisk's item event for the foe in place and Mummy's change of ability for the attacker, and the
// existing rules play both as they arrive. Frisk's item plays inside the frisker's pop-up with our
// wording (items.ts), and Mummy's change raises and lowers the Mummy pop-up over the attacker
// (abilities.ts). The game's own pop-ups for either ability stay out. The game's line that the
// attacker acquired Mummy is neither printed nor listed as a fallback, as with Trace's change today.
import { describe, expect, it } from 'vitest'

import { gen5ScriptOf, NEXT } from '../../script/testing'
import { buildGen3Stream } from '../backend'
import { itemOf } from '../tables/lookup'
import { plain, popUp } from '../testing'

const FRISK = '|-item||Leftovers|[from] ability: Frisk|[of] p1a: Dugtrio'
const MUMMY = '|-activate|p2a: Tyranitar|ability: Mummy|Arena Trap|[of] p1a: Dugtrio'

/** The stream of the Gen 5 short log: its instructions from NEXT on without the END, with plain
 * spaces, and its fallbacks from NEXT on. */
function streamFrom(...lines: string[]) {
  const result = buildGen3Stream(gen5ScriptOf(...lines))
  return {
    scene: result.instructions
      .filter(({ line, instruction }) => line >= NEXT && instruction.op !== 'end')
      .map(({ instruction }) => plain(instruction)),
    fallbacks: result.fallbacks.filter(({ line }) => line >= NEXT),
  }
}

describe("Gen 5's Frisk line", () => {
  // Scene: Dugtrio's Frisk finds Tyranitar's Leftovers.
  it("sets the foe's item inside the frisker's pop-up and says it in our wording", () => {
    expect(streamFrom(FRISK)).toEqual({
      scene: [
        popUp('near', 'Frisk', true),
        { op: 'item', side: 'far', slot: 0, item: itemOf('Leftovers').number },
        "The opposing Tyranitar's Leftovers was revealed!",
        popUp('near', 'Frisk', false),
      ],
      fallbacks: [
        { line: NEXT, kind: 'phrase', detail: 'no game message for an item shown by Frisk' },
      ],
    })
  })
})

describe("Gen 5's Mummy line", () => {
  // Scene: Dugtrio touches Tyranitar's Mummy, and Dugtrio's Arena Trap becomes Mummy.
  it("raises and lowers the Mummy pop-up over the attacker as the ability's change", () => {
    expect(streamFrom(MUMMY)).toEqual({
      scene: [popUp('near', 'Mummy', true), popUp('near', 'Mummy', false)],
      fallbacks: [],
    })
  })
})
