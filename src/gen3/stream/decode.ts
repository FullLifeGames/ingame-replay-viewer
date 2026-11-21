// The bytes of an instruction stream back to the stream model, for the specs and the page's
// debug view. It refuses every stream the ROM's validator refuses (replay_stream_check.c): a
// version it does not know, a header or an op of the wrong size, an operand outside its range, a
// number at or above the expansion's count, a mon the game cannot make, an empty side, a slot
// operand that names no mon. It refuses more: a byte outside the charset, a trainer pic at or above
// its count.
import type { Side } from '../../script/types'
import { Gen3Error } from '../errors'
import { decodeText, EOS } from '../text/charset'
import { fieldSize, readField } from './fields'
import {
  INSTRUCTION,
  MON,
  MON_OFFSET,
  monOffset,
  OP,
  type Op,
  OP_SIZE,
  PRINT_SIZE,
  STREAM,
  STREAM_OFFSET,
  TRAINER,
  TRAINER_OFFSET,
  trainerOffset,
} from './format'
import {
  type Fields,
  type FixedOp,
  type Instruction,
  LAYOUT,
  MON_FIELDS,
  type Party,
  type Stream,
  type StreamMon,
  type StreamTrainer,
  TRAINER_FIELDS,
} from './instructions'
import { checkTeams } from './teams'

const OPS: ReadonlyMap<number, Op> = new Map(
  Object.entries(OP).map(([op, code]) => [code, op as Op]),
)

export function decodeStream(bytes: Uint8Array): Stream {
  const { offset, length } = readHeader(bytes)
  const trainer = (side: Side) =>
    readRecord<StreamTrainer>(TRAINER_FIELDS, TRAINER_OFFSET, bytes.subarray(trainerOffset(side)), {
      label: `${side} trainer`,
    })
  const stream: Stream = {
    trainers: { near: trainer('near'), far: trainer('far') },
    parties: { near: readParty(bytes, 'near'), far: readParty(bytes, 'far') },
    instructions: readInstructions(bytes.subarray(offset, offset + length)),
  }
  checkTeams(stream)
  return stream
}

function readHeader(bytes: Uint8Array): { offset: number; length: number } {
  if (bytes.length < STREAM.headerSize) {
    throw new Gen3Error(`a stream has ${String(STREAM.headerSize)} bytes of header at least`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint16(STREAM_OFFSET.version, true)
  if (version !== STREAM.version) {
    throw new Gen3Error(`stream version ${String(version)} is unknown; this reads version 1`)
  }
  expectValue('header size', view.getUint16(STREAM_OFFSET.headerSize, true), STREAM.headerSize)
  expectValue('trainer size', view.getUint8(STREAM_OFFSET.trainerSize), TRAINER.size)
  expectValue('mon size', view.getUint8(STREAM_OFFSET.monSize), MON.size)
  const offset = view.getUint32(STREAM_OFFSET.instructionsOffset, true)
  const length = view.getUint32(STREAM_OFFSET.instructionsLength, true)
  if (offset < STREAM.tablesEnd || offset + length > bytes.length) {
    const span = `${String(offset)}+${String(length)}`
    throw new Gen3Error(`instructions at ${span} lie outside the ${String(bytes.length)} bytes`)
  }
  return { offset, length }
}

function expectValue(name: string, value: number, expected: number): void {
  if (value !== expected) {
    throw new Gen3Error(`stream ${name} is ${String(value)}, version 1 has ${String(expected)}`)
  }
}

// A slot whose species is 0 holds no mon, whatever its other bytes (the ROM's Replay_HoldsMon).
function readParty(bytes: Uint8Array, side: Side): Party {
  return Array.from({ length: STREAM.partySize }, (_, slot) => {
    const record = bytes.subarray(monOffset(side, slot))
    if (readField('u16', record, MON_OFFSET.species, 'species') === 0) return null
    return readRecord<StreamMon>(MON_FIELDS, MON_OFFSET, record, {
      label: `${side} mon ${String(slot)}`,
    })
  })
}

// `record` starts at the record; each field's label starts with the record's.
function readRecord<T extends object>(
  fields: Fields<T>,
  offsets: Readonly<Record<keyof T & string, number>>,
  record: Uint8Array,
  { label }: { readonly label: string },
): T {
  const values: Record<string, unknown> = {}
  for (const [name, kind] of fields) {
    values[name] = readField(kind, record, offsets[name], `${label} ${name}`)
  }
  return values as T
}

function readInstructions(body: Uint8Array): Instruction[] {
  const instructions: Instruction[] = []
  let at = 0
  while (at < body.length) {
    if (instructions.at(-1)?.op === 'end') throw new Gen3Error(`bytes after END at ${String(at)}`)
    const operands = readOperands(body, at)
    instructions.push(operands.instruction)
    at = operands.end
  }
  if (instructions.at(-1)?.op !== 'end') throw new Gen3Error('the stream does not end with END')
  return instructions
}

function readOperands(body: Uint8Array, at: number): { instruction: Instruction; end: number } {
  const start = at + INSTRUCTION.headerSize
  const code = body[at] as number
  const end = start + (body[at + 1] ?? 0)
  if (start > body.length || end > body.length) {
    throw new Gen3Error(`the instruction at ${String(at)} is cut short`)
  }
  const op = OPS.get(code)
  if (op === undefined) throw new Gen3Error(`op ${String(code)} at ${String(at)} is unknown`)
  const operands = body.subarray(start, end)
  return { instruction: op === 'print' ? readPrint(operands) : readFixed(op, operands), end }
}

function readFixed(op: FixedOp, operands: Uint8Array): Instruction {
  if (operands.length !== OP_SIZE[op]) {
    throw new Gen3Error(`${op} has size ${String(operands.length)}, not ${String(OP_SIZE[op])}`)
  }
  const fields: Fields<Readonly<Record<string, unknown>>> = LAYOUT[op]
  const instruction: Record<string, unknown> = { op }
  let at = 0
  for (const [name, kind] of fields) {
    instruction[name] = readField(kind, operands, at, `${op} ${name}`)
    at += fieldSize(kind)
  }
  return instruction as Instruction
}

// The size byte cannot pass PRINT_SIZE.max, so only the lower bound needs a check.
function readPrint(operands: Uint8Array): Instruction {
  if (operands.length < PRINT_SIZE.min || operands.indexOf(EOS) !== operands.length - 1) {
    throw new Gen3Error(`PRINT of ${String(operands.length)} bytes does not end with its one EOS`)
  }
  return { op: 'print', text: decodeText(operands.subarray(0, -1)) }
}
