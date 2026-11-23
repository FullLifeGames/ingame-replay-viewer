// The effects of Gen 1 and Gen 2 moves on one Pokémon (#60), as the Gen 3 backend plays them.
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, sceneOf, streamOfLog } from '../testing'

const fallbacksOf = (...lines: string[]) =>
  streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)

const anyMove = expect.any(Number) as number

describe('Bide (Gen 1 to 3)', () => {
  const lines = [
    '|move|p2a: Tyranitar|Bide|p2a: Tyranitar',
    '|-start|p2a: Tyranitar|move: Bide',
    '|-activate|p2a: Tyranitar|move: Bide',
    '|-end|p2a: Tyranitar|move: Bide',
    '|-damage|p1a: Dugtrio|50/100',
  ]

  it('says the energy it stores, then its release, and nothing as it starts', () => {
    expect(sceneOf(...lines).map(plain)).toEqual([
      'The opposing Tyranitar used Bide!',
      { op: 'move', user: 'far', target: 'far', move: anyMove },
      'The opposing Tyranitar is storing energy!',
      'The opposing Tyranitar unleashed its energy!',
      { op: 'hit', side: 'near', effectiveness: 'normal' },
      { op: 'hp', side: 'near', hp: 50 },
    ])
  })

  it('names the start, which the expansion shows only as the move', () => {
    expect(fallbacksOf(...lines)).toEqual([
      { line: NEXT + 1, kind: 'mechanic', detail: 'no state in the stream for Bide starting' },
    ])
  })
})

describe('the starts of Rage, Mist and Future Sight (Gen 1 and 2)', () => {
  it.each([
    ['Rage', "Dugtrio's rage is building!"],
    ['Mist', 'Dugtrio surrounds itself with a protective mist!'],
    ['move: Future Sight', 'Dugtrio foresaw an attack!'],
  ])('%s says the line of the expansion', (effect, text) => {
    const line = `|-start|p1a: Dugtrio|${effect}`

    expect(sceneOf(line).map(plain)).toEqual([text])
    expect(fallbacksOf(line)).toEqual([])
  })
})

describe('Future Sight as it hits', () => {
  it('says its target took the attack', () => {
    const lines = ['|-end|p2a: Tyranitar|move: Future Sight', '|-damage|p2a: Tyranitar|60/100']

    expect(sceneOf(...lines).map(plain)[0]).toBe(
      'The opposing Tyranitar took the Future Sight attack!',
    )
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe("Heal Bell's activation (Gen 5 and later shape)", () => {
  it('says the bell chimed', () => {
    const lines = [
      '|move|p1a: Dugtrio|Heal Bell|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Heal Bell',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Heal Bell!',
      { op: 'move', user: 'near', target: 'near', move: anyMove },
      'A bell chimed!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})
