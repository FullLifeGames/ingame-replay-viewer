// The lines Gen 1 and Gen 2 replays add (#60), as the battle script reads them.
import { describe, expect, it } from 'vitest'

import { NEXT, scriptOf } from '../testing'

describe('a Pokémon that must recharge', () => {
  it('drops the line as state the client keeps', () => {
    const script = scriptOf(
      '|move|p1a: Dugtrio|Hyper Beam|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|60/100',
      '|-mustrecharge|p1a: Dugtrio',
    )

    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([
      { line: NEXT + 2, text: '|-mustrecharge|p1a: Dugtrio', reason: 'state' },
    ])
  })
})
