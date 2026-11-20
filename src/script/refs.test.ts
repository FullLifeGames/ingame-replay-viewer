import type { Battle } from '@pkmn/client'
import { describe, expect, it } from 'vitest'

import { newBattle } from './client'
import { ScriptError } from './errors'
import { effectOf, healthOf, refOf, sideOf } from './refs'

function battleAfter(log: string): Battle {
  const battle = newBattle()
  for (const line of log.split('\n')) {
    battle.add(line)
  }
  return battle
}

describe('sideOf', () => {
  it('puts player 1 on the near side and player 2 on the far side', () => {
    expect(sideOf('p1', 3)).toBe('near')
    expect(sideOf('p2', 4)).toBe('far')
  })

  it('refuses a third player with the line number', () => {
    expect(() => sideOf('p3', 7)).toThrow(ScriptError)
    expect(() => sideOf('p3', 7)).toThrow(/^line 7: /)
  })
})

describe('refOf', () => {
  const intro = [
    '|switch|p1a: Tyranitar|Tyranitar, F|100/100',
    '|switch|p2a: Fantasy Meadow|Tyranitar, M|100/100',
  ].join('\n')

  it('resolves a nickname to its team member', () => {
    expect(refOf(battleAfter(intro), 'p2a: Fantasy Meadow', 25)).toEqual({ side: 'far', index: 0 })
    expect(refOf(battleAfter(intro), 'p1a: Tyranitar', 24)).toEqual({ side: 'near', index: 0 })
  })

  it('numbers team members in order of first appearance', () => {
    const battle = battleAfter(`${intro}\n|switch|p2a: Machine Passage|Skarmory, F|100/100`)

    expect(refOf(battle, 'p2a: Machine Passage', 36)).toEqual({ side: 'far', index: 1 })
    battle.add('|switch|p2a: Fantasy Meadow|Tyranitar, M|100/100')
    expect(refOf(battle, 'p2a: Fantasy Meadow', 150)).toEqual({ side: 'far', index: 0 })
  })

  it('refuses a Pokémon that never appeared, with the line number', () => {
    expect(() => refOf(battleAfter(intro), 'p2: Skarmory', 40)).toThrow(/^line 40: .*p2: Skarmory/)
  })

  it('refuses a name that is not the active Pokémon', () => {
    expect(() => refOf(battleAfter(intro), 'p1a: Mew', 41)).toThrow(/^line 41: .*p1a: Mew/)
  })
})

describe('healthOf', () => {
  it('keeps HP as a fraction of the logged scale', () => {
    expect(healthOf('71/100 par', 100, 1)).toEqual({ hp: { hp: 71, max: 100 }, status: 'par' })
    expect(healthOf('24/48', 48, 1)).toEqual({ hp: { hp: 24, max: 48 } })
  })

  it('takes the scale of a faint from the Pokémon', () => {
    expect(healthOf('0 fnt', 100, 1)).toEqual({ hp: { hp: 0, max: 100 } })
    expect(healthOf('0 fnt', 48, 1)).toEqual({ hp: { hp: 0, max: 48 } })
  })

  it.each(['', 'lots', 'x/100'])('refuses the HP string %j with the line number', (text) => {
    expect(() => healthOf(text, 100, 9)).toThrow(ScriptError)
    expect(() => healthOf(text, 100, 9)).toThrow(/^line 9: /)
  })
})

describe('effectOf', () => {
  it('splits an effect into name and kind', () => {
    expect(effectOf('item: Leftovers')).toEqual({ name: 'Leftovers', kind: 'item' })
    expect(effectOf('ability: Sand Stream')).toEqual({ name: 'Sand Stream', kind: 'ability' })
    expect(effectOf('move: Wish')).toEqual({ name: 'Wish', kind: 'move' })
  })

  it('leaves the kind out where the log names none', () => {
    expect(effectOf('Sandstorm')).toEqual({ name: 'Sandstorm' })
  })
})
