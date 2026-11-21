import { describe, expect, it } from 'vitest'

import { plain, sceneOf } from '../testing'

const stat = (side: 'near' | 'far', name: string, stages: number, arrows: string) => ({
  op: 'stat',
  side,
  stat: name,
  stages,
  arrows,
})

describe('stat changes', () => {
  it("plays Dragon Dance's two boosts as one arrow animation, then says each (X9)", () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Dragon Dance|p1a: Dugtrio',
      '|-boost|p1a: Dugtrio|atk|1',
      '|-boost|p1a: Dugtrio|spe|1',
    )
    expect(scene.slice(2).map(plain)).toEqual([
      stat('near', 'atk', 1, 'several'),
      "Dugtrio's Attack rose!",
      stat('near', 'spe', 1, 'none'),
      "Dugtrio's Speed rose!",
    ])
  })

  it('plays the arrows of one stat for a change alone, by its stages', () => {
    expect(sceneOf('|-unboost|p2a: Tyranitar|atk|2').map(plain)).toEqual([
      stat('far', 'atk', -2, 'one'),
      "The opposing Tyranitar's Attack harshly fell!",
    ])
  })

  it('starts a new animation where the direction or the Pokémon changes', () => {
    const scene = sceneOf(
      '|-boost|p1a: Dugtrio|spa|2',
      '|-unboost|p1a: Dugtrio|spe|1',
      '|-unboost|p2a: Tyranitar|spe|1',
    )
    expect(scene.flatMap((step) => (step.op === 'stat' ? [step.arrows] : []))).toEqual([
      'one',
      'one',
      'one',
    ])
  })
})
