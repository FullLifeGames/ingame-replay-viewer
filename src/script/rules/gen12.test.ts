// The lines Gen 1 and Gen 2 replays add (#60), as the battle script reads them.
import { describe, expect, it } from 'vitest'

import { eventsAt, NEXT, scriptOf } from '../testing'

const DUGTRIO = { side: 'near', index: 0 } as const

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

describe('a stat stage set outright (Belly Drum)', () => {
  const BELLY_DRUM = '|-setboost|p1a: Dugtrio|atk|6|[from] move: Belly Drum'
  const cause = { name: 'Belly Drum', kind: 'move' }

  it('changes the stat by the stages from the one before to the one the line sets', () => {
    const script = scriptOf(
      '|move|p1a: Dugtrio|Swords Dance|p1a: Dugtrio',
      '|-boost|p1a: Dugtrio|atk|2',
      '|move|p1a: Dugtrio|Belly Drum|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|50/100',
      BELLY_DRUM,
    )

    expect(eventsAt(script, NEXT + 4)).toEqual([
      { kind: 'statChange', line: NEXT + 4, who: DUGTRIO, stat: 'atk', stages: 4, cause },
    ])
  })

  it('counts from 0 for a stat that has not changed', () => {
    const script = scriptOf('|-damage|p1a: Dugtrio|50/100', BELLY_DRUM)

    expect(eventsAt(script, NEXT + 1)).toEqual([
      { kind: 'statChange', line: NEXT + 1, who: DUGTRIO, stat: 'atk', stages: 6, cause },
    ])
  })

  it('gives a stat at its limit for a stage set to the one it has', () => {
    const script = scriptOf('|-setboost|p1a: Dugtrio|atk|0')

    expect(eventsAt(script, NEXT)).toEqual([
      { kind: 'statLimit', line: NEXT, who: DUGTRIO, stat: 'atk', direction: 'up' },
    ])
  })
})
