// The instruction stream, version 5 (plan §2): the numbers both sides of the seam share. The C
// side is rom/gen3/include/replay_stream.h; format.test.ts holds the two equal, name by name
// (`OP.sendOut` is REPLAY_OP_SEND_OUT). The stream is little-endian; it starts with its version.
//
// The order rules (#18): a stream that breaks one is refused by the encoder, the decoder
// (order.ts) and the ROM's validator alike.
// 1. INTRO comes at most once, as the first instruction.
// 2. SEND_OUT needs INTRO before it and a side that has had no battler out yet.
// 3. SWITCH_IN needs a side whose battler left by WITHDRAW or FAINT.
// 4. Each side operand of the ops in ORDER.onFieldOps names a side with a battler out; WITHDRAW
//    and FAINT take it off. An ANIM of ORDER.freeAnims is free: the game plays the weather
//    animations with no battler out, after a double KO.
// 5. Every other op is free: PRINT, TURN, WEATHER, END, FLUSH_TEXT_BOX, MOVE_TYPE, and STATUS
//    and ITEM, which name a party slot (Heal Bell reaches the whole party).
import type { BoostID, StatusName } from '@pkmn/data'

import type { Side } from '../../script/types'

/** The stream header's values and where the team tables and the instructions start. */
export const STREAM = {
  version: 5,
  headerSize: 0x10,
  sideCount: 2,
  partySize: 6,
  trainersOffset: 0x10,
  monsOffset: 0x40,
  tablesEnd: 0x160,
} as const

/** Byte offsets of the stream header's fields. */
export const STREAM_OFFSET = {
  version: 0x00,
  headerSize: 0x02,
  trainerSize: 0x04,
  monSize: 0x05,
  reserved: 0x06,
  instructionsOffset: 0x08,
  instructionsLength: 0x0c,
} as const

/** A trainer of the trainer table: near first, then far. */
export const TRAINER = { size: 24, nameLength: 20 } as const

export const TRAINER_OFFSET = { name: 0, trainerPic: 20, teamSize: 22, revealed: 23 } as const

/**
 * A Pokémon of a party table. `maxHpLimit` is the lowest max HP a mon may not have: the
 * expansion's `INSTANT_HP_BAR_DROP` (`battle_controllers.h`), which the health bar reads as "empty
 * the bar at once". The ROM's validator refuses a mon at or above it, and so does the decoder.
 */
export const MON = { size: 24, nicknameLength: 13, maxHpLimit: 0x7fff } as const

export const MON_OFFSET = {
  species: 0,
  maxHp: 2,
  level: 4,
  gender: 5,
  shiny: 6,
  reserved: 7,
  nickname: 8,
  reservedTail: 21,
} as const

/** Where a side's trainer sits in the stream. */
export function trainerOffset(side: Side): number {
  return STREAM.trainersOffset + SIDE[side] * TRAINER.size
}

/** Where a mon of a side's party table sits in the stream. */
export function monOffset(side: Side, slot: number): number {
  return STREAM.monsOffset + (SIDE[side] * STREAM.partySize + slot) * MON.size
}

/** Each instruction is `u8 op, u8 size`, then `size` bytes of operands. */
export const INSTRUCTION = { headerSize: 2 } as const

export const OP = {
  end: 0x00,
  turn: 0x01,
  print: 0x02,
  intro: 0x03,
  sendOut: 0x04,
  withdraw: 0x05,
  switchIn: 0x06,
  move: 0x07,
  hit: 0x08,
  hp: 0x09,
  faint: 0x0a,
  status: 0x0b,
  stat: 0x0c,
  anim: 0x0d,
  weather: 0x0e,
  volatile: 0x0f,
  ability: 0x10,
  item: 0x11,
  itemPopUp: 0x12,
  trapTurn: 0x13,
  flushTextBox: 0x14,
  formChange: 0x15,
  showMon: 0x16,
  tera: 0x17,
  moveType: 0x18,
  megaEvolve: 0x19,
} as const

export type Op = keyof typeof OP

/** The operand size of each op but PRINT, whose text sets its own (PRINT_SIZE). */
export const OP_SIZE = {
  end: 1,
  turn: 2,
  intro: 0,
  sendOut: 5,
  withdraw: 1,
  switchIn: 5,
  move: 5,
  hit: 2,
  hp: 3,
  faint: 1,
  status: 3,
  stat: 4,
  anim: 2,
  weather: 1,
  volatile: 3,
  ability: 4,
  item: 4,
  itemPopUp: 3,
  trapTurn: 3,
  flushTextBox: 0,
  formChange: 3,
  showMon: 1,
  tera: 2,
  moveType: 1,
  megaEvolve: 3,
} as const satisfies Record<Exclude<Op, 'print'>, number>

/** PRINT's operand: its text in the game's charset and EOS, one glyph at least. */
export const PRINT_SIZE = { min: 2, max: 255 } as const

export const SIDE = { near: 0, far: 1 } as const satisfies Record<Side, number>

export const GENDER = { male: 0, female: 1, none: 2 } as const

export const OUTCOME = { nearWon: 0, farWon: 1, tie: 2, unknown: 3 } as const

export const STATUS = {
  none: 0,
  slp: 1,
  psn: 2,
  brn: 3,
  frz: 4,
  par: 5,
  tox: 6,
} as const satisfies Record<StatusName | 'none', number>

export const WEATHER = { none: 0, rain: 1, sun: 2, sand: 3, hail: 4, snow: 5 } as const

/** The order of the expansion's `enum Stat`, which starts with STAT_HP = 0. */
export const STAT = {
  atk: 1,
  def: 2,
  spe: 3,
  spa: 4,
  spd: 5,
  accuracy: 6,
  evasion: 7,
} as const satisfies Record<BoostID, number>

/** Which stat arrows a STAT shows: none, those of one stat, or those of several. */
export const ARROWS = { none: 0, one: 1, several: 2 } as const

export const EFFECTIVENESS = { normal: 0, super: 1, resisted: 2 } as const

export const VOLATILE = { substitute: 1 } as const

/** Our animation ids; #6's C table maps each to a B_ANIM_* or a status animation. */
export const ANIM = {
  substituteFade: 1,
  heldItemEffect: 2,
  heldItemBerry: 3,
  rainContinues: 4,
  sunContinues: 5,
  sandstormContinues: 6,
  hailContinues: 7,
  leechSeedDrain: 8,
  focusPunchSetup: 9,
  wishHeal: 10,
  itemSteal: 11,
  statusPsn: 12,
  statusBrn: 13,
  statusSlp: 14,
  statusPrz: 15,
  statusFrz: 16,
  simpleHeal: 17,
  snowContinues: 18,
} as const

/**
 * The masks of the order rules, as bits by OP and ANIM number: the ops whose side operands name a
 * side with a battler out (WITHDRAW, MOVE, HIT, HP, FAINT, STAT, ANIM, VOLATILE, ABILITY,
 * ITEM_POP_UP, TRAP_TURN, FORM_CHANGE, SHOW_MON, TERA, MEGA_EVOLVE), and the five weather anims
 * that need none. order.test.ts holds each mask equal to the OR of those names.
 */
export const ORDER = { onFieldOps: 0x2edb7a0, freeAnims: 0x400f0 } as const
