import { describe, expect, it } from 'vitest'

import {
  blockSelector,
  blockTable,
  cipherStep,
  PKM_SOURCES,
  type PkmInput,
  pkmNumbers,
  shinyBound,
} from './gen5-bw2-pkm'

// Every text here is written for the spec and none is copied from pokebw2: the structs carry the
// member names the encoder reads, and every size, table value, constant and cipher number is
// invented.

const TABLE = `// Invented: four rows, each a different order of four chunks of 24 bytes.
static const u8 blockShufLUT[4][4] = {
    { 0, 24, 48, 72 },
    { 0x18, 0x00, 0x48, 0x30 },
    { 72, 48, 24, 0 }, // a comment after a row
    { 48, 72, 0, 24 },
};`

const PICKER = `void *PML_PkmGetParamBlockCore(BoxPkm *mon, u32 personality, u32 which) {
    u8 *first = mon->contentBuffer.chunks[0].rawData;
    return first + blockShufLUT[(personality & 0x300) >> 8][which];
}`

const STEP = `static u16 PML_CryptoNextKey(u32 *seed);
static u16 PML_CryptoNextKey(u32 *seed) {
    *seed = *seed * 0x2f1 + 0x55u;
    return *seed >> 12;
}`

const RARE = `BOOL PML_UtilPIDIsRare(u32 trainer, u32 personality) {
    return (TOP(trainer) ^ LOW(trainer) ^ TOP(personality) ^ LOW(personality)) < 5;
}`

const TOOL = [TABLE, PICKER, STEP, RARE].join('\n\n')

const PARTY = `#define PARTY_SIZE 3
enum { PKM_DATA_BLOCK_A = 2, PKM_DATA_BLOCK_B = 0, PKM_DATA_BLOCK_C = 3, PKM_DATA_BLOCK_D = 1 };
typedef struct { u8 rawData[24]; } PkmBufferChunk;
typedef struct { PkmBufferChunk chunks[4]; } PkmBuffer;
struct BoxPkm { u32 pid; u16 marks; u16 checksum; PkmBuffer contentBuffer; };
struct PartyPkm { BoxPkm base; u32 statusCond; u16 nowHP; u16 maxHP; u8 level; u8 spare;
    u16 atk; u16 def; u16 spa; u16 spd; u16 spe; MailData mail; };
struct PokeParty { s32 capacity; s32 count; PartyPkm pkms[PARTY_SIZE]; u8 slotExists; };
typedef struct { u16 species; u16 item; u32 id; u32 exp; u8 friendship; u8 ability;
    u8 language; u8 spare[9]; } PkmBlockA;
typedef struct { u16 moves[4]; u8 pp[4]; u8 ppUps[4]; u32 hpIV : 5; u32 atkIV : 5;
    u32 defIV : 5; u32 speIV : 5; u32 spaIV : 5; u32 spdIV : 5; u32 isNicknamed : 1; u32 : 1;
    u8 gender : 2; u8 form : 6; u8 nature; } PkmBlockB;
typedef struct { u16 nickname[8]; u8 originGame; } PkmBlockC;
typedef struct { u16 otName[6]; u8 ball; u8 metLevel : 7; u8 otGender : 1; } PkmBlockD;`

/** A whole invented input. */
const INPUT: PkmInput = {
  pokeToolC: TOOL,
  partyH: PARTY,
  mailH: 'struct MailData { u32 sender; u16 lines[5]; };',
  pmsH: '',
  pokemonH: '#define GENDER_MALE 7\n#define GENDER_FEMALE 8\n#define GENDER_UNKNOWN 9',
  languageH: '#define LANGUAGE_KLINGON 1\n#define LANGUAGE_ENGLISH 4',
  versionH: '#define VERSION_WHITE2 30\n#define VERSION_BLACK2 31',
  speciesList: 'SPECIES_NONE\nSPECIES_BUDLING\nSPECIES_SHRUBLET = 7 # a gap\nSPECIES_TREANT\n',
  movesList: 'MOVE_NONE\nMOVE_POKE\nMOVE_PROD\n',
  itemsList: 'ITEM_NONE\nITEM_POKE_BALL\nITEM_ACORN\n',
  abilitiesList: 'ABILITY_NONE\nABILITY_STURDY_ROOTS\n',
  naturesList: 'NATURE_CALM = 3\nNATURE_BOLD\n',
}

const without = (text: string, part: string) => text.replace(part, '')

// Scene: the table that puts a Pokémon's four blocks in the content buffer, by the PID's row.
describe('blockTable', () => {
  it('reads hex and decimal rows as rows of numbers', () => {
    expect(blockTable(TABLE, 'blockShufLUT')).toEqual([
      [0, 24, 48, 72],
      [24, 0, 72, 48],
      [72, 48, 24, 0],
      [48, 72, 0, 24],
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
    const named = TABLE.replace('{ 0, 24, 48, 72 }', '{ 0, 24, 48, OFFSET_D }')
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
    expect(layouts.PartyPkm?.fields['base.contentBuffer']).toEqual({ offset: 8, size: 96 })
    expect(layouts.PartyPkm?.fields.statusCond).toEqual({ offset: 104, size: 4 })
    expect(layouts.PkmBlockA?.size).toBe(24)
    expect(layouts.PkmBlockB?.fields.form).toEqual({ offset: 20, size: 1, bit: 2, bits: 6 })
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
      SPECIES_NONE: 0,
      SPECIES_BUDLING: 1,
      SPECIES_SHRUBLET: 7,
      SPECIES_TREANT: 8,
    })
    expect(pkm.moves).toEqual({ MOVE_NONE: 0, MOVE_POKE: 1, MOVE_PROD: 2 })
    expect(pkm.items).toEqual({ ITEM_NONE: 0, ITEM_POKE_BALL: 1, ITEM_ACORN: 2 })
    expect(pkm.abilities).toEqual({ ABILITY_NONE: 0, ABILITY_STURDY_ROOTS: 1 })
    expect(pkm.natures).toEqual({ NATURE_CALM: 3, NATURE_BOLD: 4 })
  })

  it('throws naming the block when a block is one byte longer than the chunk', () => {
    const partyH = PARTY.replace('u8 spare[9];', 'u8 spare[10];')
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
