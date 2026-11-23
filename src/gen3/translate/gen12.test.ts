// The lines Gen 1 and Gen 2 replays add (#60), as the Gen 3 backend plays them.
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, sceneOf, streamOfLog } from '../testing'

const fallbacksOf = (...lines: string[]) =>
  streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)

describe('a miss without a target (Gen 1 and 2)', () => {
  const MISS = ['|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[miss]', '|-miss|p1a: Dugtrio']

  it("says the move's target avoided the attack", () => {
    expect(sceneOf(...MISS).map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      'The opposing Tyranitar avoided the attack!',
    ])
    expect(fallbacksOf(...MISS)).toEqual([])
  })

  it('keeps our line where no move with a target comes before it', () => {
    expect(sceneOf('|-miss|p1a: Dugtrio').map(plain)).toEqual(["Dugtrio's attack missed!"])
    expect(fallbacksOf('|-miss|p1a: Dugtrio')).toEqual([
      { line: NEXT, kind: 'phrase', detail: 'no game message for a miss without a target' },
    ])
  })
})
