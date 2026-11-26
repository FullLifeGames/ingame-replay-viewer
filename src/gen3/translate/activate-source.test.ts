import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, sceneOf, streamOfLog } from '../testing'

/** The PRINTs and the fallbacks of `lines` after the leads. */
function linesOf(...lines: string[]) {
  return {
    texts: sceneOf(...lines)
      .filter(({ op }) => op === 'print')
      .map((instruction) => plain(instruction)),
    fallbacks: streamOfLog(...lines)
      .fallbacks.filter(({ line }) => line >= NEXT)
      .map(({ kind, detail }) => ({ kind, detail })),
  }
}

// An activation whose line names the Pokémon of `[of]` as well (#88, U1).
describe('an activation that names its source', () => {
  // `CancelerInfatuation` sets B_SCR to the Pokémon it loves, then `BattleScript_MoveUsedIsInLove`
  // prints STRINGID_PKMNINLOVE with the one in love as B_ATK.
  it.each([
    ['p2a: Tyranitar', 'p1a: Dugtrio', 'The opposing Tyranitar is in love with Dugtrio!'],
    ['p1a: Dugtrio', 'p2a: Tyranitar', 'Dugtrio is in love with the opposing Tyranitar!'],
  ])("says Attract's line each turn on %s for %s", (who, love, text) => {
    expect(linesOf(`|-activate|${who}|move: Attract|[of] ${love}`)).toEqual({
      texts: [text],
      fallbacks: [],
    })
  })

  // `BattleScript_EffectLockOn`, Mind Reader's too: STRINGID_PKMNTOOKAIM with the user as B_ATK
  // and its target as B_DEF.
  it.each(['Lock-On', 'Mind Reader'])('says that %s took aim at its target', (move) => {
    expect(
      linesOf(
        `|move|p1a: Dugtrio|${move}|p2a: Tyranitar`,
        `|-activate|p1a: Dugtrio|move: ${move}|[of] p2a: Tyranitar`,
      ),
    ).toEqual({
      texts: [`Dugtrio used ${move}!`, 'Dugtrio took aim at the opposing Tyranitar!'],
      fallbacks: [],
    })
  })

  // Snatch, Guard Split, Power Split and Speed Swap carry `[of]` too, and keep our listed line.
  it('keeps our listed line for Snatch', () => {
    expect(linesOf('|-activate|p1a: Dugtrio|move: Snatch|[of] p2a: Tyranitar')).toEqual({
      texts: ['Dugtrio used Snatch!'],
      fallbacks: [{ kind: 'phrase', detail: 'no game message for Snatch acting' }],
    })
  })

  it('keeps our listed line for an Attract that names no source', () => {
    expect(linesOf('|-activate|p2a: Tyranitar|move: Attract')).toEqual({
      texts: ['The opposing Tyranitar used Attract!'],
      fallbacks: [{ kind: 'phrase', detail: 'no game message for Attract acting' }],
    })
  })
})
