import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import {
  ACCEPTED_RENAMES,
  constantMatches,
  gameName,
  gen5Ability,
  gen5Item,
  gen5Move,
  gen5Nature,
  gen5Species,
  pkmGender,
} from './names.ts'

// Scene: a replay's team names an entry Black 2 never had. The map must say which kind and which
// name, never write a number of another game.
describe('an entry outside Gen 5', () => {
  it('fails by kind and name', () => {
    expect(() => gen5Species('Xerneas')).toThrow('no Gen 5 species Xerneas')
    expect(() => gen5Move('Moonblast')).toThrow('no Gen 5 move Moonblast')
    expect(() => gen5Item('Assault Vest')).toThrow('no Gen 5 item Assault Vest')
    expect(() => gen5Ability('Fairy Aura')).toThrow('no Gen 5 ability Fairy Aura')
  })
})

// The numbers expected here are @pkmn's own dex numbers, which in Gen 5 the game shares.
describe('the maps by dex number', () => {
  it('gives a species, a move, an item and an ability their dex numbers', () => {
    expect(gen5Species('Pikachu')).toEqual({ num: Dex.species.get('Pikachu').num })
    expect(gen5Move('Thunderbolt')).toBe(Dex.moves.get('Thunderbolt').num)
    expect(gen5Item('Leftovers')).toBe(Dex.items.get('Leftovers').num)
    expect(gen5Ability('Static')).toBe(Dex.abilities.get('Static').num)
  })

  // Scene: the log names a typed Hidden Power, the game knows one move of that name.
  it('gives "Hidden Power" and each typed Hidden Power the same move', () => {
    const typed = ['Hidden Power Fire', 'Hidden Power Ice', 'Hidden Power Fighting']
    for (const name of typed) expect(gen5Move(name), name).toBe(gen5Move('Hidden Power'))
  })

  // Scene: both Gen 5 OU test replays carry a Therian forme; the game takes its base species.
  it("gives a forme its base species' number with the forme beside it", () => {
    expect(gen5Species('Landorus-Therian')).toEqual({
      num: gen5Species('Landorus').num,
      forme: 'Therian',
    })
  })

  it('gives the two renamed items and the four renamed moves a number', () => {
    for (const name of ['Mail', 'Pretty Feather']) expect(gen5Item(name), name).toBeGreaterThan(0)
    const moves = ['Smelling Salts', 'Feint Attack', 'High Jump Kick', 'Vise Grip']
    for (const name of moves) expect(gen5Move(name), name).toBeGreaterThan(0)
  })
})

describe('the names the game gives', () => {
  it('names each accepted rename by its Gen 5 name', () => {
    expect(ACCEPTED_RENAMES.item).toEqual([
      ['Mail', 'Greet Mail'],
      ['Pretty Feather', 'Pretty Wing'],
    ])
    expect(gameName('item', 'Pretty Feather')).toBe('Pretty Wing')
    expect(gameName('move', 'Feint Attack')).toBe('Faint Attack')
    expect(gameName('move', 'High Jump Kick')).toBe('Hi Jump Kick')
    expect(gameName('move', 'Smelling Salts')).toBe('Smelling Salt')
    expect(gameName('move', 'Vise Grip')).toBe('Vice Grip')
  })

  it('names a typed Hidden Power by the one move and leaves other names alone', () => {
    expect(gameName('move', 'Hidden Power Water')).toBe('Hidden Power')
    expect(gameName('move', 'Hidden Power')).toBe('Hidden Power')
    expect(gameName('move', 'Tackle')).toBe('Tackle')
    expect(gameName('item', 'Mail')).toBe('Greet Mail')
    expect(gameName('species', 'Mail')).toBe('Mail')
  })
})

// The normalising rule on names alone, against constants spelt as pokebw2 spells them.
describe('constantMatches', () => {
  it.each([
    ['SPECIES_FARFETCHD', 'Farfetch’d'],
    ['SPECIES_NIDORAN_F', 'Nidoran-F'],
    ['SPECIES_FLABEBE', 'Flabébé'],
    ['ITEM_POKE_BALL', 'Poké Ball'],
    ['SPECIES_MR_MIME', 'Mr. Mime'],
    ['SPECIES_TYPE_NULL', 'Type: Null'],
    ['MOVE_U_TURN', 'U-turn'],
  ])('matches %s to %s', (constant, name) => {
    expect(constantMatches(constant, name)).toBe(true)
  })

  it('refuses another name, and a constant without its prefix', () => {
    expect(constantMatches('SPECIES_NIDORAN_M', 'Nidoran-F')).toBe(false)
    expect(constantMatches('MOVE_VICE_GRIP', 'Vise Grip')).toBe(false)
    expect(constantMatches('MRMIME', 'Mr. Mime')).toBe(false)
  })
})

// Invented nature numbers: @pkmn numbers the natures in another order than the game, so a nature
// goes by its name.
describe('gen5Nature', () => {
  const natures = { NATURE_TIMID: 7, NATURE_MODEST: 3 }

  it('takes the number the list gives NATURE_<name>', () => {
    expect(gen5Nature(natures, 'Timid')).toBe(7)
    expect(gen5Nature(natures, 'modest')).toBe(3)
  })

  it('fails by name on a nature the list or Gen 5 lacks', () => {
    expect(() => gen5Nature(natures, 'Adamant')).toThrow(
      'the list of natures has no NATURE_ADAMANT',
    )
    expect(() => gen5Nature(natures, 'Grumpy')).toThrow('no Gen 5 nature Grumpy')
  })
})

describe('pkmGender', () => {
  it("gives the party format's gender for the battle script's", () => {
    expect(pkmGender('M')).toBe('male')
    expect(pkmGender('F')).toBe('female')
    expect(pkmGender(undefined)).toBe('none')
  })
})
