import { describe, expect, it } from 'vitest'

import {
  blockSelector,
  blockTable,
  cipherStep,
  PKM_SOURCES,
  pkmNumbers,
  shinyBound,
} from './gen5-bw2-pkm'
import { PARTY, PICKER, PKM_INPUT as INPUT, RARE, STEP, TABLE, TOOL } from './gen5-bw2-pkm.fixtures'

// Every text here is written for the spec and none is copied from pokebw2: the structs carry the
// member names the encoder reads, and every size, table value, constant and cipher number is
// invented. The reader's texts are in gen5-bw2-pkm.fixtures.ts.

const without = (text: string, part: string) => text.replace(part, '')

// Scene: the table that puts a Pokémon's four blocks in the content buffer, by the PID's row.
describe('blockTable', () => {
  it('reads hex and decimal rows as rows of numbers', () => {
    expect(blockTable(TABLE, 'blockShufLUT')).toEqual([
      [24, 0, 72, 48],
      [72, 48, 24, 0],
      [48, 72, 0, 24],
      [24, 72, 0, 48],
    ])
  })

  it('throws naming the table when a row holds three values in a row of four', () => {
    const ragged = TABLE.replace('{ 72, 48, 24, 0 }', '{ 72, 48, 24 }')
    expect(() => blockTable(ragged, 'blockShufLUT')).toThrow(/blockShufLUT/)
  })

  it('throws naming the table when a row is missing or a value is no number', () => {
    expect(() => blockTable(without(TABLE, '{ 48, 72, 0, 24 },'), 'blockShufLUT')).toThrow(
      /blockShufLUT/,
    )
    const named = TABLE.replace('{ 24, 72, 0, 48 }', '{ 24, 72, 0, OFFSET_D }')
    expect(() => blockTable(named, 'blockShufLUT')).toThrow(/blockShufLUT/)
  })

  it('throws naming the table when the source has none', () => {
    expect(() => blockTable(PICKER, 'blockShufLUT')).toThrow(/blockShufLUT/)
  })
})

// Scene: the function that finds a block masks and shifts the PID to pick the table's row.
describe('blockSelector', () => {
  it("reads the mask and the shift from the function's body", () => {
    expect(blockSelector(TOOL, 'PML_PkmGetParamBlockCore', 'blockShufLUT')).toEqual({
      mask: 0x300,
      shift: 8,
    })
  })

  it('throws naming the function when the body picks the row another way', () => {
    const other = PICKER.replace('(personality & 0x300) >> 8', 'personality % 4')
    expect(() => blockSelector(other, 'PML_PkmGetParamBlockCore', 'blockShufLUT')).toThrow(
      /PML_PkmGetParamBlockCore/,
    )
  })

  it('throws naming the function when the source has no body of it', () => {
    expect(() => blockSelector(TABLE, 'PML_PkmGetParamBlockCore', 'blockShufLUT')).toThrow(
      /PML_PkmGetParamBlockCore/,
    )
  })
})

// Scene: the cipher steps its key once per halfword; the step's numbers stand in its body.
describe('cipherStep', () => {
  it('reads the multiplier, the increment and the shift past the prototype', () => {
    expect(cipherStep(TOOL, 'PML_CryptoNextKey')).toEqual({
      multiplier: 0x2f1,
      increment: 0x55,
      shift: 12,
    })
  })

  it('throws naming the function when the step has another shape', () => {
    const xor = STEP.replace('*seed * 0x2f1 + 0x55u', '*seed * 0x2f1 ^ 0x55u')
    expect(() => cipherStep(xor, 'PML_CryptoNextKey')).toThrow(/PML_CryptoNextKey/)
    const twice = STEP.replace('return *seed >> 12;', '*seed += 1;\n    return *seed >> 12;')
    expect(() => cipherStep(twice, 'PML_CryptoNextKey')).toThrow(/PML_CryptoNextKey/)
  })
})

// Scene: a PID is shiny when the XOR of the halves of OT id and PID lies below a bound.
describe('shinyBound', () => {
  it('reads the bound', () => {
    expect(shinyBound(TOOL, 'PML_UtilPIDIsRare')).toBe(5)
  })

  it('throws naming the function when the body compares another way', () => {
    const equal = RARE.replace(/return[^;]*;/, 'return trainer == personality;')
    expect(() => shinyBound(equal, 'PML_UtilPIDIsRare')).toThrow(/PML_UtilPIDIsRare/)
    const named = RARE.replace('< 5;', '< RARE_LIMIT;')
    expect(() => shinyBound(named, 'PML_UtilPIDIsRare')).toThrow(/PML_UtilPIDIsRare/)
    const three = RARE.replace(' ^ LOW(personality)', '')
    expect(() => shinyBound(three, 'PML_UtilPIDIsRare')).toThrow(/PML_UtilPIDIsRare/)
  })
})

// Scene: the encoder (E-6b) takes every number of a Pokémon's data from the generated file.
describe('pkmNumbers', () => {
  it('lays out the party, the chunk and the four blocks, each block within its chunk', () => {
    const { layouts } = pkmNumbers(INPUT)
    expect(Object.keys(layouts)).toEqual([
      'PartyPkm',
      'PokeParty',
      'PkmBufferChunk',
      'PkmBlockA',
      'PkmBlockB',
      'PkmBlockC',
      'PkmBlockD',
    ])
    expect(layouts.PkmBufferChunk?.size).toBe(24)
    expect(layouts.PartyPkm?.fields['base.contentBuffer']).toEqual({ offset: 4, size: 96 })
    expect(layouts.PartyPkm?.fields.statusCond).toEqual({ offset: 104, size: 4 })
    expect(layouts.PkmBlockA?.size).toBe(24)
    expect(layouts.PkmBlockB?.fields.form).toEqual({ offset: 1, size: 1, bit: 2, bits: 6 })
    expect(layouts.PkmBlockD?.fields.otGender).toEqual({ offset: 13, size: 1, bit: 7, bits: 1 })
  })

  it("gives the table, each block's column, the selector, the cipher's step and the bound", () => {
    const pkm = pkmNumbers(INPUT)
    expect(pkm.blockOffsets).toHaveLength(4)
    expect(pkm.blockColumns).toEqual({ PkmBlockA: 2, PkmBlockB: 0, PkmBlockC: 3, PkmBlockD: 1 })
    expect(pkm.selector).toEqual({ mask: 0x300, shift: 8 })
    expect(pkm.cipher).toEqual({ multiplier: 0x2f1, increment: 0x55, shift: 12 })
    expect(pkm.shinyBelow).toBe(5)
  })

  it('gives the constants by name and the lists whole', () => {
    const pkm = pkmNumbers(INPUT)
    expect(pkm.constants).toEqual({
      PARTY_SIZE: 3,
      GENDER_MALE: 7,
      GENDER_FEMALE: 8,
      GENDER_UNKNOWN: 9,
      LANGUAGE_ENGLISH: 4,
      VERSION_BLACK2: 31,
    })
    expect(pkm.species).toEqual({
      SPECIES_SEED: 0,
      SPECIES_BUDLING: 1,
      SPECIES_SHRUBLET: 7,
      SPECIES_TREANT: 8,
    })
    expect(pkm.moves).toEqual({ MOVE_NUDGE: 0, MOVE_POKE: 1, MOVE_PROD: 2 })
    expect(pkm.items).toEqual({ ITEM_PEBBLE: 0, ITEM_POKE_BALL: 1, ITEM_ACORN: 2 })
    expect(pkm.abilities).toEqual({ ABILITY_DRIFT: 0, ABILITY_STURDY_ROOTS: 1 })
    expect(pkm.natures).toEqual({ NATURE_CALM: 3, NATURE_BOLD: 4 })
  })

  it('throws naming the block when a block is one byte longer than the chunk', () => {
    const partyH = PARTY.replace('u8 spare[8];', 'u8 spare[9];')
    expect(() => pkmNumbers({ ...INPUT, partyH })).toThrow(/PkmBlockA/)
  })

  it('throws when the content buffer is not one chunk per block', () => {
    const partyH = PARTY.replace('chunks[4]', 'chunks[3]')
    expect(() => pkmNumbers({ ...INPUT, partyH })).toThrow(/contentBuffer/)
  })

  it('throws naming the struct and the member the encoder needs and a struct lacks', () => {
    const partyH = without(PARTY, 'u8 ball; ')
    expect(() => pkmNumbers({ ...INPUT, partyH })).toThrow(/PkmBlockD.*ball/)
  })

  it('throws naming the table when the selector can give a value with no row', () => {
    const pokeToolC = without(TOOL, '{ 48, 72, 0, 24 },').replace('[4][4]', '[3][4]')
    expect(() => pkmNumbers({ ...INPUT, pokeToolC })).toThrow(/blockShufLUT.*no row/)
  })

  it('throws naming the table when a row puts two blocks on one chunk', () => {
    const pokeToolC = TOOL.replace('{ 72, 48, 24, 0 }', '{ 72, 48, 24, 24 }')
    expect(() => pkmNumbers({ ...INPUT, pokeToolC })).toThrow(/blockShufLUT.*chunk/)
  })

  it('throws when a constant or a list is missing', () => {
    const pokemonH = without(INPUT.pokemonH, '#define GENDER_UNKNOWN 9')
    expect(() => pkmNumbers({ ...INPUT, pokemonH })).toThrow(/GENDER_UNKNOWN/)
    const naturesList = 'NATURE_CALM = BOLD\n'
    expect(() => pkmNumbers({ ...INPUT, naturesList })).toThrow(/NATURE_CALM/)
  })
})

// Scene: the eleven files of the format join the one list of pokebw2's files we read.
describe('PKM_SOURCES', () => {
  it('names the cipher, the constants and the lists', () => {
    expect(Object.values(PKM_SOURCES)).toContain('src/system/poke_tool.c')
    expect(Object.values(PKM_SOURCES)).toContain('generated/species.txt')
  })
})
