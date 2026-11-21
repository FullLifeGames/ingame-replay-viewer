// The instruction stream as a model (plan §2): the team tables and the instructions, with text in
// Unicode and our enums by name. LAYOUT gives each op's operands in byte order; encode.ts and
// decode.ts read it, so an operand's place lives here alone.
import type { Side } from '../../script/types'
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
type Weather = keyof typeof WEATHER
type Stat = keyof typeof STAT
type Arrows = keyof typeof ARROWS
type Effectiveness = keyof typeof EFFECTIVENESS
type Volatile = keyof typeof VOLATILE
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
  move: { readonly user: Side; readonly target: Side; readonly move: number }
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
    ['move', 'u16'],
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
    ['ability', 'u16'],
    ['show', 'bool'],
  ],
  item: [
    ['side', side],
    ['slot', 'slot'],
    ['item', 'u16'],
  ],
}

/** A trainer's fields; their offsets are TRAINER_OFFSET's under the same names. */
export const TRAINER_FIELDS: Fields<StreamTrainer> = [
  ['name', { text: TRAINER.nameLength }],
  ['trainerPic', 'u16'],
  ['teamSize', 'u8'],
  ['revealed', 'u8'],
]

/** A mon's fields; their offsets are MON_OFFSET's under the same names. */
export const MON_FIELDS: Fields<StreamMon> = [
  ['species', 'u16'],
  ['maxHp', 'u16'],
  ['level', 'u8'],
  ['gender', { enum: GENDER }],
  ['shiny', 'bool'],
  ['nickname', { text: MON.nicknameLength }],
]
