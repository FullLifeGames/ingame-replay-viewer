import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import { genericMove } from './generic'
import { abilityOf, constantOf, itemOf, moveOf, readTable, speciesOf } from './lookup'

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

  it('take the given name where the expansion has no display name', () => {
    expect(itemOf('TM01')).toEqual({ number: 582, name: 'TM01' })
  })

  it('play every Hidden Power type as Hidden Power', () => {
    expect(moveOf('Hidden Power Fire')).toEqual({ number: 237, name: 'Hidden Power' })
    expect(moveOf('Hidden Power')).toEqual({ number: 237, name: 'Hidden Power' })
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
