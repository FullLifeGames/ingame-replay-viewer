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

describe("Gen 1's Reflect and Light Screen, which last on their user", () => {
  it("say the side message of the user's side", () => {
    const lines = [
      '|move|p1a: Dugtrio|Reflect|p1a: Dugtrio',
      '|-start|p1a: Dugtrio|Reflect',
      '|move|p2a: Tyranitar|Light Screen|p2a: Tyranitar',
      '|-start|p2a: Tyranitar|Light Screen',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Reflect!',
      { op: 'move', user: 'near', target: 'near', move: expect.any(Number) as number },
      'Reflect made your side stronger against physical moves!',
      'The opposing Tyranitar used Light Screen!',
      { op: 'move', user: 'far', target: 'far', move: expect.any(Number) as number },
      'Light Screen made the opposing side stronger against special moves!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe('Belly Drum (Gen 2 and 3)', () => {
  it('cuts the HP, plays the arrows and says the maxed Attack, as the expansion does', () => {
    const lines = [
      '|move|p1a: Dugtrio|Belly Drum|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|50/100',
      '|-setboost|p1a: Dugtrio|atk|6|[from] move: Belly Drum',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Belly Drum!',
      { op: 'move', user: 'near', target: 'near', move: expect.any(Number) as number },
      { op: 'hp', side: 'near', hp: 50 },
      { op: 'stat', side: 'near', stat: 'atk', stages: 6, arrows: 'one' },
      'Dugtrio cut its own HP and maximized its Attack!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe("Mean Look's trap", () => {
  it('says its target can no longer escape', () => {
    const lines = [
      '|move|p1a: Dugtrio|Mean Look|p2a: Tyranitar',
      '|-activate|p2a: Tyranitar|trapped',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Mean Look!',
      { op: 'move', user: 'near', target: 'far', move: expect.any(Number) as number },
      'The opposing Tyranitar can no longer escape!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})
