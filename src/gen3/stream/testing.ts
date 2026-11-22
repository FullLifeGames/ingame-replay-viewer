// Spec helpers: a stream model with full team tables around the instructions under test.
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

/** One instruction of each op, in op order. */
export const EACH_OP: readonly Instruction[] = [
  { op: 'turn', number: 300 },
  { op: 'print', text: 'Go! Dugtrio!' },
  { op: 'intro' },
  { op: 'sendOut', side: 'far', slot: 5, hp: 100, status: 'tox' },
  { op: 'withdraw', side: 'near' },
  { op: 'switchIn', side: 'near', slot: 1, hp: 71, status: 'par' },
  { op: 'move', user: 'far', target: 'near', move: 191 },
  { op: 'hit', side: 'near', effectiveness: 'super' },
  { op: 'hp', side: 'near', hp: 0 },
  { op: 'faint', side: 'near' },
  { op: 'status', side: 'far', slot: 0, status: 'slp' },
  { op: 'stat', side: 'far', stat: 'evasion', stages: -2, arrows: 'several' },
  { op: 'anim', side: 'near', anim: 'statusFrz' },
  { op: 'weather', weather: 'hail' },
  { op: 'volatile', side: 'far', volatile: 'substitute', on: true },
  { op: 'ability', side: 'near', ability: 45, show: false },
  { op: 'item', side: 'far', slot: 3, item: 234 },
  { op: 'itemPopUp', side: 'near', item: 234 },
  { op: 'trapTurn', side: 'far', move: 83 },
  { op: 'end', outcome: 'farWon' },
]
