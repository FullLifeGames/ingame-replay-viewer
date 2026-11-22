// The order rules of the instruction stream (#18), as format.ts states them and the ROM's
// validator holds them (ValidateOrder, replay_stream_check.c). The encoder and the decoder both
// check them here. ORDER's masks say which ops and anims the rules cover; LAYOUT says which of an
// op's operands name a side.
import type { Side } from '../../script/types'
import { Gen3Error } from '../errors'
import type { Kind } from './fields'
import { ANIM, OP, type Op, ORDER, SIDE } from './format'
import { type FixedOp, type Instruction, LAYOUT } from './instructions'

/** Where a side's battler is: none sent out yet, one out, or gone by WITHDRAW or FAINT. */
type Presence = 'none' | 'out' | 'left'

type Presences = Record<Side, Presence>

/** The names whose bit is set in `mask`, by their number. */
function namesIn<K extends string>(numbers: Readonly<Record<K, number>>, mask: number): Set<K> {
  return new Set((Object.keys(numbers) as K[]).filter((name) => (mask >>> numbers[name]) & 1))
}

const ON_FIELD_OPS: ReadonlySet<Op> = namesIn(OP, ORDER.onFieldOps)
const FREE_ANIMS: ReadonlySet<keyof typeof ANIM> = namesIn(ANIM, ORDER.freeAnims)

const namesSide = (kind: Kind) => typeof kind === 'object' && 'enum' in kind && kind.enum === SIDE

/** The operands of each op that name a side, in byte order. */
const SIDE_OPERANDS: ReadonlyMap<Op, readonly string[]> = new Map(
  (Object.keys(LAYOUT) as FixedOp[]).map((op) => {
    const fields: readonly (readonly [string, Kind])[] = LAYOUT[op]
    return [op, fields.filter(([, kind]) => namesSide(kind)).map(([name]) => name)] as const
  }),
)

export function checkOrder(instructions: readonly Instruction[]): void {
  const presences: Presences = { near: 'none', far: 'none' }
  const introduced = instructions[0]?.op === 'intro'
  instructions.forEach((instruction, at) => {
    const where = `${instruction.op} at ${String(at)}`
    if (instruction.op === 'intro' && at !== 0) {
      throw new Gen3Error(`${where} is not the first instruction`)
    }
    if (instruction.op === 'sendOut' && !introduced) {
      throw new Gen3Error(`${where} comes before INTRO`)
    }
    checkSides(instruction, where, presences)
  })
}

function checkSides(instruction: Instruction, where: string, presences: Presences): void {
  if (instruction.op === 'sendOut' || instruction.op === 'switchIn') {
    enter(instruction.op, instruction.side, where, presences)
  } else if (ON_FIELD_OPS.has(instruction.op)) {
    if (instruction.op === 'anim' && FREE_ANIMS.has(instruction.anim)) return
    checkOnField(instruction, where, presences)
  }
}

// Rule 4: every side the op names has its battler out; WITHDRAW and FAINT take it off.
function checkOnField(instruction: Instruction, where: string, presences: Presences): void {
  const operands = instruction as unknown as Readonly<Record<string, Side>>
  for (const name of SIDE_OPERANDS.get(instruction.op) ?? []) {
    const side = operands[name] as Side
    if (presences[side] !== 'out') refuse(where, side, 'which has no battler out')
  }
  if (instruction.op === 'withdraw' || instruction.op === 'faint') {
    presences[instruction.side] = 'left'
  }
}

// SEND_OUT puts a side's first battler out, SWITCH_IN the next one after WITHDRAW or FAINT.
function enter(op: 'sendOut' | 'switchIn', side: Side, where: string, presences: Presences): void {
  const presence = presences[side]
  if (op === 'sendOut' && presence !== 'none') refuse(where, side, 'which has had a battler out')
  if (op === 'switchIn' && presence === 'out') refuse(where, side, 'whose battler is still out')
  if (op === 'switchIn' && presence === 'none') refuse(where, side, 'which has had no battler out')
  presences[side] = 'out'
}

function refuse(where: string, side: Side, why: string): never {
  throw new Gen3Error(`${where} names the ${side} side, ${why}`)
}
