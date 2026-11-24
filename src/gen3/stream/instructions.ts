// The instruction stream as a model (plan §2): the team tables and the instructions, with text in
// Unicode and our enums by name. LAYOUT gives each op's operands in byte order; encode.ts and
// decode.ts read it, so an operand's place lives here alone. The bounds of the expansion's numbers
// come from counts.json, which the generator reads from the pinned tree.
import type { Side } from '../../script/types'
import counts from '../tables/counts.json'
import type { Kind } from './fields'
import {
  ANIM,
  ARROWS,
  EFFECTIVENESS,
  GENDER,
  MON,
  OUTCOME,
  SIDE,
  STAT,
  STATUS,
  TRAINER,
  VOLATILE,
  WEATHER,
  type Op,
} from './format'

type Gender = keyof typeof GENDER
type Outcome = keyof typeof OUTCOME
export type Status = keyof typeof STATUS
export type Weather = keyof typeof WEATHER
type Stat = keyof typeof STAT
type Arrows = keyof typeof ARROWS
type Effectiveness = keyof typeof EFFECTIVENESS
export type Volatile = keyof typeof VOLATILE
export type Anim = keyof typeof ANIM

interface OnSide {
  readonly side: Side
}

interface InParty extends OnSide {
  /** The mon's party index, `PokemonRef.index`. */
  readonly slot: number
}

interface Entering extends InParty {
  readonly hp: number
  readonly status: Status
}

/** Each op's operands; species, moves, abilities and items are the expansion's numbers. */
interface Operands {
  end: { readonly outcome: Outcome }
  turn: { readonly number: number }
  print: { readonly text: string }
  /** INTRO has no operands. */
  intro: unknown
  sendOut: Entering
  withdraw: OnSide
  switchIn: Entering
  /**
   * `animTurn` is the turn the move's animation reads (the engine's `gAnimMoveTurn`): an odd one
   * picks the second animation of a move that has two.
   */
  move: {
    readonly user: Side
    readonly target: Side
    readonly move: number
    readonly animTurn: number
  }
  hit: OnSide & { readonly effectiveness: Effectiveness }
  hp: OnSide & { readonly hp: number }
  faint: OnSide
  status: InParty & { readonly status: Status }
  stat: OnSide & { readonly stat: Stat; readonly stages: number; readonly arrows: Arrows }
  anim: OnSide & { readonly anim: Anim }
  weather: { readonly weather: Weather }
  volatile: OnSide & { readonly volatile: Volatile; readonly on: boolean }
  ability: OnSide & { readonly ability: number; readonly show: boolean }
  item: InParty & { readonly item: number }
  /** The pop-up of the side's held item as it takes effect. */
  itemPopUp: OnSide & { readonly item: number }
  /** The end-of-turn animation of the move that traps the side's mon. */
  trapTurn: OnSide & { readonly move: number }
  /** The text box emptied, as a battle script's `flushtextbox`; no operands. */
  flushTextBox: unknown
  /** The side's mon takes the form of `species` (Castform's Forecast) until it leaves the field. */
  formChange: OnSide & { readonly species: number }
  /**
   * The side's mon shown again with no animation, as the game shows a Fly, Dig, Dive or Bounce
   * user whose hit turn plays no move animation (the controller's sprite invisibility command).
   */
  showMon: OnSide
}

export type Instruction = { [K in Op]: { readonly op: K } & Operands[K] }[Op]

export interface StreamTrainer {
  readonly name: string
  /** The expansion's `enum TrainerPicID`. */
  readonly trainerPic: number
  readonly teamSize: number
  readonly revealed: number
}

export interface StreamMon {
  readonly species: number
  /** The battle log's HP scale. */
  readonly maxHp: number
  readonly level: number
  readonly gender: Gender
  readonly shiny: boolean
  readonly nickname: string
}

/** A party table: six slots, `null` where the slot is empty. */
export type Party = readonly (StreamMon | null)[]

export interface Stream {
  readonly trainers: Readonly<Record<Side, StreamTrainer>>
  readonly parties: Readonly<Record<Side, Party>>
  readonly instructions: readonly Instruction[]
}

export type FixedOp = Exclude<Op, 'print'>

export type Fields<T> = readonly (readonly [name: keyof T & string, kind: Kind])[]

const side = { enum: SIDE } as const
const status = { enum: STATUS } as const

/** A number of the expansion below its count; the ROM's validator refuses any other. */
const below = (count: number, min = 0) => ({ bytes: 2, min, max: count - 1 }) as const

/** A species of the expansion; 0 is SPECIES_NONE, no mon. */
const species = below(counts.NUM_SPECIES, 1)

/** The operands of each op but PRINT, in byte order. */
export const LAYOUT: { readonly [K in FixedOp]: Fields<Operands[K]> } = {
  end: [['outcome', { enum: OUTCOME }]],
  turn: [['number', 'u16']],
  intro: [],
  sendOut: [
    ['side', side],
    ['slot', 'slot'],
    ['hp', 'u16'],
    ['status', status],
  ],
  withdraw: [['side', side]],
  switchIn: [
    ['side', side],
    ['slot', 'slot'],
    ['hp', 'u16'],
    ['status', status],
  ],
  move: [
    ['user', side],
    ['target', side],
    ['move', below(counts.MOVES_COUNT_ALL)],
    ['animTurn', 'u8'],
  ],
  hit: [
    ['side', side],
    ['effectiveness', { enum: EFFECTIVENESS }],
  ],
  hp: [
    ['side', side],
    ['hp', 'u16'],
  ],
  faint: [['side', side]],
  status: [
    ['side', side],
    ['slot', 'slot'],
    ['status', status],
  ],
  stat: [
    ['side', side],
    ['stat', { enum: STAT }],
    ['stages', 's8'],
    ['arrows', { enum: ARROWS }],
  ],
  anim: [
    ['side', side],
    ['anim', { enum: ANIM }],
  ],
  weather: [['weather', { enum: WEATHER }]],
  volatile: [
    ['side', side],
    ['volatile', { enum: VOLATILE }],
    ['on', 'bool'],
  ],
  ability: [
    ['side', side],
    ['ability', below(counts.ABILITIES_COUNT)],
    ['show', 'bool'],
  ],
  item: [
    ['side', side],
    ['slot', 'slot'],
    ['item', below(counts.ITEMS_COUNT)],
  ],
  itemPopUp: [
    ['side', side],
    ['item', below(counts.ITEMS_COUNT)],
  ],
  trapTurn: [
    ['side', side],
    ['move', below(counts.MOVES_COUNT_ALL)],
  ],
  flushTextBox: [],
  formChange: [
    ['side', side],
    ['species', species],
  ],
  showMon: [['side', side]],
}

/** A trainer's fields; their offsets are TRAINER_OFFSET's under the same names. */
export const TRAINER_FIELDS: Fields<StreamTrainer> = [
  ['name', { text: TRAINER.nameLength }],
  ['trainerPic', below(counts.TRAINER_PIC_COUNT)],
  ['teamSize', 'u8'],
  ['revealed', 'u8'],
]

/** A mon's fields; their offsets are MON_OFFSET's under the same names. Species 0 is no mon. */
export const MON_FIELDS: Fields<StreamMon> = [
  ['species', species],
  ['maxHp', below(MON.maxHpLimit, 1)],
  ['level', { bytes: 1, min: 1, max: counts.MAX_LEVEL }],
  ['gender', { enum: GENDER }],
  ['shiny', 'bool'],
  ['nickname', { text: MON.nicknameLength }],
]
