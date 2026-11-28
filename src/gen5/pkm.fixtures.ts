// An invented Pokémon format (#97) for the encoder's specs. Every number in this file is made up
// for them: the sizes, the offsets, the bits, the block table, the selector, the cipher's step, the
// shiny bound, the constants, the lists and the terminator. The structs, members and constants
// carry pokebw2's names, since the encoder looks them up by name, and the members sit in an order
// of their own. scripts/gen5-fixtures-real.test.ts holds that no number here equals the one that
// build/gen5/bw2.json generates under the same name.
import type { FieldLayout, PkmNumbers, StructLayout } from './bw2-numbers.ts'

/** The invented chunk: each block takes 28 bytes of the content buffer. */
const CHUNK = 28

const at = (offset: number, size: number): FieldLayout => ({ offset, size })
const bits = (offset: number, size: number, bit: number, width: number): FieldLayout => ({
  offset,
  size,
  bit,
  bits: width,
})
const layout = (size: number, fields: StructLayout['fields']): StructLayout => ({
  size,
  align: 8,
  fields,
})

const PARTY_PKM = layout(156, {
  base: at(0, 120),
  'base.checksum': at(0, 2),
  'base.partyDecrypted': bits(2, 2, 3, 1),
  'base.boxDecrypted': bits(2, 2, 4, 1),
  'base.badEgg': bits(2, 2, 6, 1),
  'base.contentBuffer': at(4, 4 * CHUNK),
  'base.pid': at(116, 4),
  statusCond: at(120, 4),
  level: at(124, 1),
  nowHP: at(126, 2),
  maxHP: at(128, 2),
  atk: at(130, 2),
  def: at(132, 2),
  spe: at(134, 2),
  spa: at(136, 2),
  spd: at(138, 2),
  mail: at(140, 16),
})

/** The invented format, consistent in itself: four blocks of a chunk each, a row of the table per
 * value of the selector, each row a different order of the four chunks. */
export const PKM: PkmNumbers = {
  layouts: {
    PartyPkm: PARTY_PKM,
    PokeParty: layout(480, {
      count: at(0, 4),
      capacity: at(4, 4),
      slotExists: at(8, 1),
      pkms: at(12, 3 * 156),
    }),
    PkmBufferChunk: layout(CHUNK, { rawData: at(0, CHUNK) }),
    PkmBlockA: layout(CHUNK, {
      language: at(0, 1),
      ability: at(1, 1),
      friendship: at(3, 1),
      exp: at(4, 4),
      id: at(8, 4),
      species: at(12, 2),
      item: at(14, 2),
    }),
    PkmBlockB: layout(CHUNK, {
      nature: at(0, 1),
      gender: bits(1, 1, 0, 2),
      form: bits(1, 1, 2, 5),
      ppUps: at(2, 4),
      pp: at(6, 4),
      moves: at(10, 8),
      isNicknamed: bits(20, 4, 0, 1),
      hpIV: bits(20, 4, 1, 5),
      atkIV: bits(20, 4, 6, 5),
      defIV: bits(20, 4, 11, 5),
      speIV: bits(20, 4, 16, 5),
      spaIV: bits(20, 4, 21, 5),
      spdIV: bits(20, 4, 26, 5),
    }),
    PkmBlockC: layout(CHUNK, { nickname: at(0, 16), originGame: at(18, 1) }),
    PkmBlockD: layout(CHUNK, {
      otName: at(0, 12),
      ball: at(14, 1),
      metLevel: bits(15, 1, 0, 7),
      otGender: bits(15, 1, 7, 1),
    }),
  },
  blockColumns: { PkmBlockA: 1, PkmBlockB: 3, PkmBlockC: 0, PkmBlockD: 2 },
  blockOffsets: [
    [2 * CHUNK, 0, 3 * CHUNK, CHUNK],
    [3 * CHUNK, 0, CHUNK, 2 * CHUNK],
    [CHUNK, 2 * CHUNK, 3 * CHUNK, 0],
    [CHUNK, 3 * CHUNK, 0, 2 * CHUNK],
  ],
  selector: { mask: 0xc00, shift: 10 },
  cipher: { multiplier: 0x9e3779b1, increment: 0x1234, shift: 13 },
  shinyBelow: 3,
  constants: {
    PARTY_SIZE: 3,
    GENDER_MALE: 1,
    GENDER_FEMALE: 2,
    GENDER_UNKNOWN: 3,
    LANGUAGE_ENGLISH: 9,
    VERSION_BLACK2: 40,
  },
  species: { SPECIES_BUDLING: 1, SPECIES_SHRUBLET: 7 },
  moves: { MOVE_POKE: 1, MOVE_PROD: 2 },
  items: { ITEM_POKE_BALL: 3, ITEM_ACORN: 5 },
  abilities: { ABILITY_STURDY_ROOTS: 1 },
  natures: { NATURE_CALM: 3, NATURE_BOLD: 4 },
}

/** A PID whose selector value under PKM is 0 (the logical order), and one whose value is 2. Ours,
 * not pokebw2's: the derivation table runs them on the real format too. */
export const ROW_0_PID = 0x0000_0123
export const ROW_2_PID = 0x1234_0812

/** The invented string terminator. */
export const TERMINATOR = 0xfff0

/** The invented format of the backend's Pokémon (src/gen5/backend/party-mon.ts) and the moment
 * script's team (scripts/gen5-moment-team.ts): its natures and Hardy, the format's "no item" and a
 * party of seven, each under a number of its own. Species, moves, items and abilities go by @pkmn's dex numbers. */
export const TEAM_PKM: PkmNumbers = {
  ...PKM,
  constants: { ...PKM.constants, PARTY_SIZE: 7 },
  items: { ...PKM.items, ITEM_NONE: 11 },
  natures: {
    ...PKM.natures,
    NATURE_MODEST: 41,
    NATURE_TIMID: 42,
    NATURE_JOLLY: 43,
    NATURE_ADAMANT: 44,
    NATURE_IMPISH: 45,
    NATURE_HARDY: 46,
  },
}
