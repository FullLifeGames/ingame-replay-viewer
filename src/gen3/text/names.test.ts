import { describe, expect, it } from 'vitest'

import type { TeamMember } from '../../script/types'
import { encodeText } from './charset'
import {
  abilityName,
  itemName,
  moveName,
  nameAtStart,
  nameInside,
  nameMon,
  nameTrainer,
  teamAtStart,
  teamInside,
} from './names'

const NBSP = ' '

const member = (species: string, name = species): TeamMember => ({
  species,
  name,
  level: 100,
  shiny: false,
})

describe('nameMon', () => {
  it('prefixes a far Pokémon at a sentence start and inside one, a near one never (N1)', () => {
    const far = nameMon('far', member('Skarmory')).mon
    const near = nameMon('near', member('Dugtrio')).mon
    expect([nameAtStart(far), nameInside(far)]).toEqual([
      'The opposing Skarmory',
      'the opposing Skarmory',
    ])
    expect([nameAtStart(near), nameInside(near)]).toEqual(['Dugtrio', 'Dugtrio'])
  })

  it("shows a Pokémon without a nickname by the expansion's display name (N2)", () => {
    expect(nameMon('near', member('Nidoran-F')).mon).toEqual({ side: 'near', name: 'Nidoran♀' })
    expect(nameMon('near', member('Nidoran-F')).nickname).toBe('Nidoran♀')
  })

  it('keeps a nickname as the log gives it, even when it names another species', () => {
    expect(nameMon('far', member('Skarmory', 'Nidoran-F')).mon.name).toBe('Nidoran-F')
  })

  it('joins the words of a name with no-break spaces and cuts the party nickname to 12 (C2)', () => {
    const named = nameMon('far', member('Skarmory', 'Machine Passage'))
    expect(named.mon.name).toBe(`Machine${NBSP}Passage`)
    expect(nameAtStart(named.mon)).toBe(`The opposing Machine${NBSP}Passage`)
    expect(encodeText(named.mon.name)).toContain(0x39)
    expect(named.nickname).toBe('Machine Pass')
    expect(named.fallback).toBeUndefined()
  })

  it('shows a character outside the charset as ? and reports it once (C3)', () => {
    const named = nameMon('near', member('Krabby', 'Pinch🦀'))
    expect(named.mon.name).toBe('Pinch?')
    expect(named.nickname).toBe('Pinch?')
    expect(named.fallback).toMatchObject({ kind: 'character' })
    expect(named.fallback?.detail).toContain('🦀')
  })
})

describe('the other names in text', () => {
  it('names a side as the game does, its words held together', () => {
    expect([teamAtStart('near'), teamInside('near')]).toEqual(['Your', 'your'])
    expect([teamAtStart('far'), teamInside('far')]).toEqual([
      `The${NBSP}opposing`,
      `the${NBSP}opposing`,
    ])
  })

  it('fits a trainer name to the charset and holds its words together', () => {
    expect(nameTrainer('xX Eric')).toEqual({ text: `xX${NBSP}Eric` })
    expect(nameTrainer('Ash🔥').fallback).toMatchObject({ kind: 'character' })
  })

  it("shows moves, items and abilities by the expansion's display names", () => {
    expect(moveName('Rock Slide')).toBe(`Rock${NBSP}Slide`)
    expect(moveName('Soft-Boiled')).toBe('Soft-Boiled')
    expect(itemName('Poke Ball')).toBe(`Poké${NBSP}Ball`)
    expect(abilityName('Sand Stream')).toBe(`Sand${NBSP}Stream`)
  })
})
