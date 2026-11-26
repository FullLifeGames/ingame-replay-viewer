// Spec helpers: a stream model with full team tables around the instructions under test.
import type { Side } from '../../script/types'
import { encodeInstruction, encodeStream } from './encode'
import { type ANIM, STREAM, STREAM_OFFSET } from './format'
import type { Instruction, Party, Stream, StreamMon } from './instructions'

export const DUGTRIO: StreamMon = {
  species: 51,
  maxHp: 100,
  level: 100,
  gender: 'male',
  shiny: false,
  nickname: 'Dugtrio',
}

const SKARMORY: StreamMon = {
  species: 227,
  maxHp: 100,
  level: 100,
  gender: 'female',
  shiny: true,
  nickname: 'Machine Pass',
}

const MAGNETON: StreamMon = { ...DUGTRIO, species: 82, gender: 'none', nickname: 'Magneton' }

const NEAR_PARTY: Party = [DUGTRIO, MAGNETON, null, null, null, null]
const FAR_PARTY: Party = [SKARMORY, DUGTRIO, MAGNETON, SKARMORY, MAGNETON, DUGTRIO]

/** A stream with both trainers and parties set and the given instructions. */
export function streamOf(instructions: readonly Instruction[]): Stream {
  return {
    trainers: {
      near: { name: 'Alice', trainerPic: 0, teamSize: 6, revealed: 2 },
      far: { name: 'xXEricXx', trainerPic: 1, teamSize: 6, revealed: 6 },
    },
    parties: { near: NEAR_PARTY, far: FAR_PARTY },
    instructions,
  }
}

/** INTRO and both leads out, near slot 0 and far slot 0: what the order rules ask before a MOVE. */
export const LEADS: readonly Instruction[] = [
  { op: 'intro' },
  { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
  { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
]

/** Where the first instruction after LEADS starts in the stream's bytes. */
export const AFTER_LEADS = STREAM.tablesEnd + LEADS.flatMap(encodeInstruction).length

/** A stream with LEADS, then the given instructions. */
export const streamWithLeads = (instructions: readonly Instruction[]): Stream =>
  streamOf([...LEADS, ...instructions])

/**
 * The bytes of `streamOf(instructions)` without the encoder's checks of END, the teams and the
 * order rules: a stream the decoder must refuse.
 */
export function rawBytes(instructions: readonly Instruction[]): Uint8Array {
  const tables = encodeStream(streamOf([{ op: 'end', outcome: 'tie' }]))
  const body = instructions.flatMap(encodeInstruction)
  const bytes = new Uint8Array(STREAM.tablesEnd + body.length)
  bytes.set(tables.subarray(0, STREAM.tablesEnd))
  bytes.set(body, STREAM.tablesEnd)
  new DataView(bytes.buffer).setUint32(STREAM_OFFSET.instructionsLength, body.length, true)
  return bytes
}

/** Each op at least once, in an order the order rules allow. */
export const EACH_OP: readonly Instruction[] = [
  { op: 'intro' },
  { op: 'sendOut', side: 'far', slot: 5, hp: 100, status: 'tox' },
  { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
  { op: 'turn', number: 300 },
  { op: 'print', text: 'Go! Dugtrio!' },
  { op: 'withdraw', side: 'near' },
  { op: 'switchIn', side: 'near', slot: 1, hp: 71, status: 'par' },
  { op: 'move', user: 'far', target: 'near', move: 191, animTurn: 1 },
  { op: 'hit', side: 'near', effectiveness: 'super' },
  { op: 'hp', side: 'near', hp: 0 },
  { op: 'status', side: 'far', slot: 0, status: 'slp' },
  { op: 'stat', side: 'far', stat: 'evasion', stages: -2, arrows: 'several' },
  { op: 'anim', side: 'near', anim: 'statusFrz' },
  { op: 'weather', weather: 'hail' },
  { op: 'volatile', side: 'far', volatile: 'substitute', on: true },
  { op: 'ability', side: 'near', ability: 45, show: false },
  { op: 'item', side: 'far', slot: 3, item: 234 },
  { op: 'itemPopUp', side: 'near', item: 234 },
  { op: 'trapTurn', side: 'far', move: 83 },
  { op: 'formChange', side: 'far', species: 1051 },
  { op: 'showMon', side: 'far' },
  { op: 'faint', side: 'near' },
  { op: 'flushTextBox' },
  { op: 'end', outcome: 'farWon' },
]

/** The END that closes an order case. */
export const END: Instruction = { op: 'end', outcome: 'tie' }
const intro: Instruction = { op: 'intro' }
const sendOut = (side: Side, slot = 0): Instruction => ({
  op: 'sendOut',
  side,
  slot,
  hp: 100,
  status: 'none',
})
const switchIn = (side: Side): Instruction => ({
  op: 'switchIn',
  side,
  slot: 1,
  hp: 100,
  status: 'none',
})
const move = (user: Side, target: Side): Instruction => ({
  op: 'move',
  user,
  target,
  move: 1,
  animTurn: 0,
})
const faint = (side: Side): Instruction => ({ op: 'faint', side })
const formChange = (side: Side): Instruction => ({ op: 'formChange', side, species: 1051 })
const showMon = (side: Side): Instruction => ({ op: 'showMon', side })

export interface OrderCase {
  /** The name of its TEST in replay_refuse_order.c, after "Replay: order: ". */
  readonly name: string
  /** The instructions before END. */
  readonly instructions: readonly Instruction[]
  /** The message of the refusal; a case without one passes. */
  readonly refused?: RegExp
}

// The order cases both sides hold: each one a TEST in replay_refuse_order.c with the same ops.
export const ORDER_CASES: readonly OrderCase[] = [
  {
    name: 'a MOVE before any SEND_OUT is refused',
    instructions: [intro, move('near', 'far')],
    refused: /^move at 1 names the near side, which has no battler out$/,
  },
  {
    name: 'a SEND_OUT before INTRO is refused',
    instructions: [sendOut('near')],
    refused: /^sendOut at 0 comes before INTRO$/,
  },
  {
    name: 'an INTRO after the first instruction is refused',
    instructions: [{ op: 'turn', number: 1 }, intro],
    refused: /^intro at 1 is not the first instruction$/,
  },
  {
    name: 'a second INTRO is refused',
    instructions: [intro, intro],
    refused: /^intro at 1 is not the first instruction$/,
  },
  {
    name: 'a second SEND_OUT of the near side is refused',
    instructions: [...LEADS, sendOut('near', 1)],
    refused: /^sendOut at 3 names the near side, which has had a battler out$/,
  },
  {
    name: 'a SWITCH_IN while the battler is out is refused',
    instructions: [...LEADS, switchIn('near')],
    refused: /^switchIn at 3 names the near side, whose battler is still out$/,
  },
  {
    name: 'a SWITCH_IN of a side never sent out is refused',
    instructions: [intro, sendOut('near'), switchIn('far')],
    refused: /^switchIn at 2 names the far side, which has had no battler out$/,
  },
  {
    name: 'HP of a side whose battler fainted is refused',
    instructions: [...LEADS, faint('far'), { op: 'hp', side: 'far', hp: 0 }],
    refused: /^hp at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a FAINT twice is refused',
    instructions: [...LEADS, faint('far'), faint('far')],
    refused: /^faint at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a MOVE at a fainted target is refused',
    instructions: [...LEADS, faint('far'), move('near', 'far')],
    refused: /^move at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a status ANIM after a WITHDRAW is refused',
    instructions: [...LEADS, { op: 'withdraw', side: 'near' }, anim('near', 'statusPsn')],
    refused: /^anim at 4 names the near side, which has no battler out$/,
  },
  {
    name: 'a FORM_CHANGE after a WITHDRAW is refused',
    instructions: [...LEADS, { op: 'withdraw', side: 'far' }, formChange('far')],
    refused: /^formChange at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a SHOW_MON after a WITHDRAW is refused',
    instructions: [...LEADS, { op: 'withdraw', side: 'near' }, showMon('near')],
    refused: /^showMon at 4 names the near side, which has no battler out$/,
  },
  {
    name: 'a double KO in sand, the sand upkeep and both switch-ins pass',
    instructions: [
      ...LEADS,
      { op: 'weather', weather: 'sand' },
      move('near', 'far'),
      faint('far'),
      faint('near'),
      anim('near', 'sandstormContinues'),
      switchIn('near'),
      switchIn('far'),
    ],
  },
  {
    name: 'a WITHDRAW, then a SWITCH_IN and a MOVE pass',
    instructions: [
      ...LEADS,
      { op: 'withdraw', side: 'near' },
      switchIn('near'),
      move('near', 'far'),
    ],
  },
  {
    name: 'a FORM_CHANGE of a battler on the field passes',
    instructions: [...LEADS, formChange('near'), formChange('far')],
  },
  {
    name: 'a SHOW_MON of a battler on the field passes',
    instructions: [...LEADS, showMon('near'), showMon('far')],
  },
  {
    name: 'a STATUS and an ITEM of a benched slot pass',
    instructions: [
      ...LEADS,
      { op: 'status', side: 'far', slot: 1, status: 'slp' },
      { op: 'item', side: 'far', slot: 1, item: 1 },
    ],
  },
  {
    name: 'a WEATHER with no INTRO passes',
    instructions: [{ op: 'weather', weather: 'rain' }],
  },
  {
    name: 'TURN and PRINT with no INTRO pass',
    instructions: [
      { op: 'turn', number: 1 },
      { op: 'print', text: 'Hi' },
    ],
  },
]

export function anim(side: Side, name: keyof typeof ANIM): Instruction {
  return { op: 'anim', side, anim: name }
}
