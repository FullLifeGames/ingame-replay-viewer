// The stream model to the bytes of the replay slot's stream (plan §2): the header, the trainer and
// party tables, then the instructions. A value the format cannot carry is a Gen3Error, never cut.
import type { Side } from '../../script/types'
import { Gen3Error } from '../errors'
import { encodeText, EOS } from '../text/charset'
import { fieldBytes } from './fields'
import {
  MON,
  MON_OFFSET,
  OP,
  PRINT_SIZE,
  monOffset,
  SIDE,
  STREAM,
  STREAM_OFFSET,
  TRAINER,
  TRAINER_OFFSET,
  trainerOffset,
} from './format'
import {
  LAYOUT,
  MON_FIELDS,
  TRAINER_FIELDS,
  type Fields,
  type FixedOp,
  type Instruction,
  type Party,
  type Stream,
} from './instructions'

const SIDES = Object.keys(SIDE) as Side[]

export function encodeStream(stream: Stream): Uint8Array {
  checkEnd(stream.instructions)
  const body = stream.instructions.flatMap(encodeInstruction)
  const bytes = new Uint8Array(STREAM.tablesEnd + body.length)
  bytes.set(headerBytes(body.length), 0)
  for (const side of SIDES) {
    const trainer = recordBytes(TRAINER_FIELDS, TRAINER_OFFSET, TRAINER.size, stream.trainers[side])
    bytes.set(trainer, trainerOffset(side))
    bytes.set(partyBytes(side, stream.parties[side]), monOffset(side, 0))
  }
  bytes.set(body, STREAM.tablesEnd)
  return bytes
}

/** One instruction: its op, its size and its operands. */
export function encodeInstruction(instruction: Instruction): number[] {
  const operands =
    instruction.op === 'print' ? printBytes(instruction.text) : operandBytes(instruction)
  return [OP[instruction.op], operands.length, ...operands]
}

function checkEnd(instructions: readonly Instruction[]): void {
  const ends = instructions.filter((instruction) => instruction.op === 'end').length
  if (ends !== 1 || instructions.at(-1)?.op !== 'end') {
    throw new Gen3Error(`a stream ends with its one END, this one has ${String(ends)}`)
  }
}

function headerBytes(instructionsLength: number): Uint8Array {
  const header = new Uint8Array(STREAM.headerSize)
  const view = new DataView(header.buffer)
  view.setUint16(STREAM_OFFSET.version, STREAM.version, true)
  view.setUint16(STREAM_OFFSET.headerSize, STREAM.headerSize, true)
  view.setUint8(STREAM_OFFSET.trainerSize, TRAINER.size)
  view.setUint8(STREAM_OFFSET.monSize, MON.size)
  view.setUint32(STREAM_OFFSET.instructionsOffset, STREAM.tablesEnd, true)
  view.setUint32(STREAM_OFFSET.instructionsLength, instructionsLength, true)
  return header
}

function partyBytes(side: Side, party: Party): Uint8Array {
  if (party.length !== STREAM.partySize) {
    throw new Gen3Error(`the ${side} party has ${String(party.length)} slots, not 6`)
  }
  const bytes = new Uint8Array(STREAM.partySize * MON.size)
  party.forEach((mon, slot) => {
    if (mon !== null) {
      bytes.set(recordBytes(MON_FIELDS, MON_OFFSET, MON.size, mon), slot * MON.size)
    }
  })
  return bytes
}

function recordBytes<T extends object>(
  fields: Fields<T>,
  offsets: Readonly<Record<keyof T & string, number>>,
  size: number,
  record: T,
): Uint8Array {
  const bytes = new Uint8Array(size)
  for (const [name, kind] of fields) bytes.set(fieldBytes(kind, record[name], name), offsets[name])
  return bytes
}

function operandBytes(instruction: Extract<Instruction, { op: FixedOp }>): number[] {
  const fields: Fields<Readonly<Record<string, unknown>>> = LAYOUT[instruction.op]
  const values = instruction as Readonly<Record<string, unknown>>
  return fields.flatMap(([name, kind]) =>
    fieldBytes(kind, values[name], `${instruction.op} ${name}`),
  )
}

function printBytes(text: string): number[] {
  const bytes = [...encodeText(text), EOS]
  if (bytes.length < PRINT_SIZE.min || bytes.length > PRINT_SIZE.max) {
    const range = `${String(PRINT_SIZE.min)} to ${String(PRINT_SIZE.max)}`
    throw new Gen3Error(`PRINT takes ${range} bytes, "${text}" has ${String(bytes.length)}`)
  }
  return bytes
}
