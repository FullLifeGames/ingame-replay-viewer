import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import abilities from './abilities.json'
import { genericMove } from './generic'
import { abilityOf, constantOf, itemOf, moveOf, readTable, speciesOf, typeOf } from './lookup'
import species from './species.json'

describe('constantOf (T8)', () => {
  it.each([
    ['SPECIES', 'Farfetch’d', 'SPECIES_FARFETCHD'],
    ['SPECIES', "Farfetch'd", 'SPECIES_FARFETCHD'],
    ['SPECIES', 'Mr. Mime', 'SPECIES_MR_MIME'],
    ['SPECIES', 'Nidoran-F', 'SPECIES_NIDORAN_F'],
    ['SPECIES', 'Flabébé', 'SPECIES_FLABEBE'],
    ['SPECIES', 'Type: Null', 'SPECIES_TYPE_NULL'],
    ['MOVE', 'Will-O-Wisp', 'MOVE_WILL_O_WISP'],
    ['MOVE', 'Hidden Power Fire', 'MOVE_HIDDEN_POWER_FIRE'],
    ['ITEM', 'King’s Rock', 'ITEM_KINGS_ROCK'],
  ] as const)('%s %s is %s', (prefix, name, constant) => {
    expect(constantOf(prefix, name)).toBe(constant)
  })
})

describe('lookups by @pkmn name', () => {
  it('give the expansion number and display name', () => {
    expect(speciesOf('Nidoran-F')).toEqual({ number: 29, name: 'Nidoran♀' })
    expect(speciesOf('Farfetch’d')).toEqual({ number: 83, name: "Farfetch'd" })
    expect(moveOf('Will-O-Wisp')).toEqual({ number: 261, name: 'Will-O-Wisp' })
    expect(abilityOf('Sand Stream').fallback).toBeUndefined()
    expect(itemOf('Poke Ball')).toEqual({ number: 1, name: 'Poké Ball' })
  })

  // The expansion names every Mega like its base species (#125): the sprite changes, the name
  // stays.
  it('give a Mega forme its own SPECIES_* row under its base name', () => {
    const [number] = species.SPECIES_CHARIZARD_MEGA_X
    expect(speciesOf('Charizard-Mega-X')).toEqual({ number, name: 'Charizard' })
    expect(number).not.toBe(speciesOf('Charizard').number)
  })

  it('take the given name where the expansion has no display name', () => {
    expect(itemOf('TM01')).toEqual({ number: 582, name: 'TM01' })
  })

  it('give a Tera type its TYPE_* number, and none for the type the game calls ???', () => {
    expect(typeOf('Fairy')).toBe(19)
    expect(typeOf('Stellar')).toBe(20)
    expect(typeOf('???')).toBeUndefined()
  })

  it('play every Hidden Power type as Hidden Power', () => {
    expect(moveOf('Hidden Power Fire')).toEqual({ number: 237, name: 'Hidden Power' })
    expect(moveOf('Hidden Power')).toEqual({ number: 237, name: 'Hidden Power' })
  })
})

// The expansion keeps As One and Embody Aspect as one constant per form, each with the one display
// name, where @pkmn names the form in parentheses and the log may write "As One" bare (D10).
describe('abilities that share a display name (#88)', () => {
  it.each([
    'As One',
    'As One (Glastrier)',
    'As One (Spectrier)',
    'Embody Aspect (Teal)',
    'Embody Aspect (Hearthflame)',
    'Embody Aspect (Wellspring)',
    'Embody Aspect (Cornerstone)',
  ])('find %s by its display name, with no fallback', (name) => {
    expect(abilityOf(name).fallback).toBeUndefined()
  })

  it('pick the form the parentheses name, else the lower number', () => {
    const [hearthflame] = abilities.ABILITY_EMBODY_ASPECT_HEARTHFLAME_MASK
    const [iceRider] = abilities.ABILITY_AS_ONE_ICE_RIDER
    expect(abilityOf('Embody Aspect (Hearthflame)')).toEqual({
      number: hearthflame,
      name: 'Embody Aspect',
    })
    expect(abilityOf('As One (Spectrier)')).toEqual({ number: iceRider, name: 'As One' })
    expect(abilityOf('As One')).toEqual({ number: iceRider, name: 'As One' })
  })
})

// Teal's mask has the lowest number of the four, so the other three show the narrowing by name.
describe('Embody Aspect by its mask (#88)', () => {
  it.each([
    ['Embody Aspect (Teal)', 'ABILITY_EMBODY_ASPECT_TEAL_MASK'],
    ['Embody Aspect (Wellspring)', 'ABILITY_EMBODY_ASPECT_WELLSPRING_MASK'],
    ['Embody Aspect (Cornerstone)', 'ABILITY_EMBODY_ASPECT_CORNERSTONE_MASK'],
  ] as const)('finds %s as %s', (name, constant) => {
    const [number] = abilities[constant]
    expect(abilityOf(name)).toEqual({ number, name: 'Embody Aspect' })
  })
})

describe('fallbacks (T9)', () => {
  it('show a form without its own constant as its base species', () => {
    expect(speciesOf('Rockruff-Dusk')).toEqual({
      number: 744,
      name: 'Rockruff',
      fallback: {
        kind: 'form',
        detail: 'Rockruff-Dusk has no SPECIES_ROCKRUFF_DUSK in the expansion; it shows Rockruff',
      },
    })
  })

  it('play the first expansion move of the same type and category for a move without one', () => {
    expect(moveOf('Paleo Wave')).toEqual({
      number: 246,
      name: 'Paleo Wave',
      fallback: {
        kind: 'move',
        detail:
          'Paleo Wave has no MOVE_PALEO_WAVE in the expansion; it plays Ancient Power, the first Rock Special move',
      },
    })
    expect(moveOf('Shadow Strike').number).toBe(122)
  })

  it('make an ability or item without a constant text alone', () => {
    expect(abilityOf('Mountaineer')).toEqual({
      number: 0,
      name: 'Mountaineer',
      fallback: {
        kind: 'ability',
        detail: 'Mountaineer has no ABILITY_MOUNTAINEER in the expansion; text without a pop-up',
      },
    })
    expect(itemOf('Mail')).toEqual({
      number: 0,
      name: 'Mail',
      fallback: { kind: 'item', detail: 'Mail has no ITEM_MAIL in the expansion; text only' },
    })
    expect(itemOf('Not An Item').name).toBe('Not An Item')
    expect(abilityOf('Not An Ability').name).toBe('Not An Ability')
  })

  it('refuse a species with no base in the expansion and names @pkmn does not know', () => {
    expect(() => speciesOf('Syclant')).toThrow(Gen3Error)
    expect(() => speciesOf('Syclant')).toThrow(/Syclant has no SPECIES_SYCLANT and no base/)
    expect(() => speciesOf('Notamon')).toThrow(/unknown species "Notamon"/)
    expect(() => moveOf('Notamove')).toThrow(/unknown move "Notamove"/)
  })
})

describe('readTable', () => {
  it('reads rows of number and display name, a missing name as null', () => {
    const table = readTable('test', { A_ONE: [1, 'One'], A_TWO: [2, null] })
    expect(table.get('A_ONE')).toEqual({ number: 1, name: 'One' })
    expect(table.get('A_TWO')).toEqual({ number: 2, name: null })
  })

  it('refuses a row of another shape', () => {
    expect(() => readTable('test', { A_ONE: ['1', 'One'] })).toThrow(/test.json: A_ONE/)
    expect(() => readTable('test', { A_ONE: [1, 2] })).toThrow(/test.json: A_ONE/)
  })
})

describe('genericMove', () => {
  it('refuses a type and category no expansion move has', () => {
    expect(() => genericMove('Stellar', 'Physical', () => 1)).toThrow(
      /no expansion move is Stellar and Physical/,
    )
  })
})
