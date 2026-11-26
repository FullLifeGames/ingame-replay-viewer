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

/** The invented string terminator. */
export const TERMINATOR = 0xfff0

/** The invented format with every name of the moment script's team (scripts/gen5-moment-team.ts)
 * in its lists, each under a number of its own. Species and moves lie inside the ranges that
 * @pkmn/data knows for Gen 5, since the team's stats and PP come from there by number. */
export const TEAM_PKM: PkmNumbers = {
  ...PKM,
  species: {
    ...PKM.species,
    SPECIES_OSHAWOTT: 12,
    SPECIES_PIKACHU: 140,
    SPECIES_ROTOM: 33,
    SPECIES_LUCARIO: 610,
    SPECIES_GYARADOS: 77,
    SPECIES_FERROTHORN: 205,
    SPECIES_SNIVY: 63,
    SPECIES_EXCADRILL: 318,
    SPECIES_CHANDELURE: 91,
    SPECIES_HAXORUS: 444,
    SPECIES_VOLCARONA: 18,
    SPECIES_BISHARP: 270,
  },
  moves: {
    ...PKM.moves,
    MOVE_TACKLE: 11,
    MOVE_WATER_GUN: 23,
    MOVE_TAIL_WHIP: 37,
    MOVE_HYDRO_PUMP: 41,
    MOVE_THUNDERBOLT: 59,
    MOVE_QUICK_ATTACK: 67,
    MOVE_IRON_TAIL: 73,
    MOVE_VOLT_TACKLE: 83,
    MOVE_SHADOW_BALL: 101,
    MOVE_THUNDER_WAVE: 109,
    MOVE_HEX: 113,
    MOVE_AURA_SPHERE: 127,
    MOVE_CLOSE_COMBAT: 131,
    MOVE_EXTREME_SPEED: 139,
    MOVE_SWORDS_DANCE: 151,
    MOVE_WATERFALL: 163,
    MOVE_DRAGON_DANCE: 173,
    MOVE_ICE_FANG: 181,
    MOVE_EARTHQUAKE: 191,
    MOVE_POWER_WHIP: 199,
    MOVE_GYRO_BALL: 211,
    MOVE_LEECH_SEED: 223,
    MOVE_SPIKES: 229,
    MOVE_LEER: 241,
    MOVE_VINE_WHIP: 251,
    MOVE_LEAF_STORM: 263,
    MOVE_ROCK_SLIDE: 271,
    MOVE_RAPID_SPIN: 281,
    MOVE_FLAMETHROWER: 293,
    MOVE_ENERGY_BALL: 307,
    MOVE_WILL_O_WISP: 311,
    MOVE_OUTRAGE: 331,
    MOVE_DRAGON_CLAW: 347,
    MOVE_QUIVER_DANCE: 359,
    MOVE_FIRE_BLAST: 367,
    MOVE_BUG_BUZZ: 379,
    MOVE_GIGA_DRAIN: 389,
    MOVE_NIGHT_SLASH: 397,
    MOVE_IRON_HEAD: 401,
    MOVE_SUCKER_PUNCH: 419,
  },
  items: {
    ...PKM.items,
    ITEM_ORAN_BERRY: 701,
    ITEM_LIGHT_BALL: 709,
    ITEM_LEFTOVERS: 719,
    ITEM_LIFE_ORB: 727,
    ITEM_MYSTIC_WATER: 733,
    ITEM_ROCKY_HELMET: 739,
    ITEM_MIRACLE_SEED: 743,
    ITEM_FOCUS_SASH: 751,
    ITEM_CHOICE_SPECS: 757,
    ITEM_DRAGON_FANG: 761,
    ITEM_SILVER_POWDER: 769,
    ITEM_BLACK_GLASSES: 773,
  },
  abilities: {
    ...PKM.abilities,
    ABILITY_TORRENT: 201,
    ABILITY_STATIC: 202,
    ABILITY_LEVITATE: 203,
    ABILITY_STEADFAST: 204,
    ABILITY_INTIMIDATE: 205,
    ABILITY_IRON_BARBS: 206,
    ABILITY_OVERGROW: 207,
    ABILITY_SAND_RUSH: 208,
    ABILITY_FLASH_FIRE: 209,
    ABILITY_MOLD_BREAKER: 210,
    ABILITY_FLAME_BODY: 211,
    ABILITY_DEFIANT: 212,
  },
  natures: {
    ...PKM.natures,
    NATURE_MODEST: 41,
    NATURE_TIMID: 42,
    NATURE_JOLLY: 43,
    NATURE_ADAMANT: 44,
    NATURE_IMPISH: 45,
  },
}
