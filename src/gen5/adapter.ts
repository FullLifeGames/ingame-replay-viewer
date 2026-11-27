// Turns one block of server commands into the ordered memory writes that hand it to a battle
// client through its adapter, as BtlAdapter_SetCmd would (#72; pokebw2 src/battle/btl_adapter.c).
// In a local battle the client takes `sendCmd` while the adapter's `returned` bit is 0
// (BtlAdapter_GetRecvCmd), so every other field is in place before `returned` drops to 0, last.
// Unlike BtlAdapter_SetCmd the writes leave the adapter's state IDLE: the server is held, and
// BtlAdapter_WaitCmd never reports a reply in that state, so it never takes the client's answer.
// The layout and the values come from build/gen5/bw2.json; this module holds none of the game's
// numbers. Adapter fields are ARM9 words, little-endian, unlike the block's own bytes.
import type { Bw2Numbers, FieldLayout, StructLayout } from './bw2-numbers'
import { littleEndian, type MemoryWrite } from './ram-write.ts'

export interface AdapterNumbers {
  layout: StructLayout
  /** The adapter command that plays server commands (BTL_ACMD_SERVER_CMD). */
  serverCmd: number
  /** The state the writes leave (BTL_ADAPTER_STATE_IDLE), which holds the server. */
  heldState: number
  /** The client's command queue (BTL_SERVER_CMD_QUE_SIZE), into which it copies the block. */
  queueSize: number
}

function named(table: Readonly<Record<string, number>>, name: string): number {
  const value = table[name]
  if (value === undefined) throw new Error(`bw2.json names no ${name}`)
  return value
}

/** The adapter's numbers from the generated file, looked up by their pokebw2 names. */
export function adapterNumbers(numbers: Bw2Numbers): AdapterNumbers {
  return {
    layout: numbers.adapter,
    serverCmd: named(numbers.adapterCommands, 'BTL_ACMD_SERVER_CMD'),
    heldState: named(numbers.adapterStates, 'BTL_ADAPTER_STATE_IDLE'),
    queueSize: numbers.queueSize,
  }
}

function fieldOf(layout: StructLayout, name: string): FieldLayout {
  const field = layout.fields[name]
  if (field === undefined) throw new Error(`the adapter's layout has no field ${name}`)
  return field
}

/** The bytes a block of server commands may take: the smaller of the adapter's `sendCmd.data`
 * and the client's queue, into which the client copies the block. */
export function blockRoom(numbers: Pick<AdapterNumbers, 'layout' | 'queueSize'>): number {
  return Math.min(fieldOf(numbers.layout, 'sendCmd.data').size, numbers.queueSize)
}

/** Throws unless the block holds a command and fits both the adapter and the client's queue. */
function checkBlock(length: number, numbers: AdapterNumbers): void {
  if (length === 0) throw new RangeError('The block is empty; it holds no command.')
  const room = blockRoom(numbers)
  if (length <= room) return
  const holder =
    room < fieldOf(numbers.layout, 'sendCmd.data').size ? "the client's queue" : 'sendCmd.data'
  throw new RangeError(`The block has ${String(length)} bytes; ${holder} holds ${String(room)}.`)
}

/** The writes that hand the client an adapter command with `data`, which may be empty: data,
 * size, the command, the held state, the reply cleared, and `returned` last. */
export function commandWrites(
  numbers: AdapterNumbers,
  adapterAddress: number,
  command: number,
  data: Uint8Array,
): MemoryWrite[] {
  const { layout } = numbers
  const whole = (field: string, value: number): MemoryWrite => {
    const { offset, size } = fieldOf(layout, field)
    const bytes = littleEndian(value, size, field)
    return { kind: 'bytes', field, address: adapterAddress + offset, bytes }
  }
  const returned = fieldOf(layout, 'returned')
  if (returned.size !== 1) throw new Error('returned must sit in one byte for a bits write')
  const mask = (2 ** (returned.bits ?? returned.size * 8) - 1) * 2 ** (returned.bit ?? 0)
  const field = 'sendCmd.data'
  const address = adapterAddress + fieldOf(layout, field).offset
  const dataWrites: MemoryWrite[] =
    data.length === 0 ? [] : [{ kind: 'bytes', field, address, bytes: [...data] }]
  return [
    ...dataWrites,
    whole('sendCmd.size', data.length),
    whole('sendCmd.cmd', command),
    whole('cmd', command),
    whole('state', numbers.heldState),
    whole('returnData', 0),
    whole('returnSize', 0),
    { kind: 'bits', field: 'returned', address: adapterAddress + returned.offset, mask, value: 0 },
  ]
}

/** The writes that put `block` of server commands into the adapter at `adapterAddress`. */
export function adapterWrites(
  numbers: AdapterNumbers,
  adapterAddress: number,
  block: Uint8Array,
): MemoryWrite[] {
  checkBlock(block.length, numbers)
  return commandWrites(numbers, adapterAddress, numbers.serverCmd, block)
}

/** The write that holds the server: the adapter's state IDLE, which BtlAdapter_WaitCmd never
 * counts as a reply, so the server waits for the player's action for good. */
export function holdWrites(numbers: AdapterNumbers, adapterAddress: number): MemoryWrite[] {
  const { offset, size } = fieldOf(numbers.layout, 'state')
  const bytes = littleEndian(numbers.heldState, size, 'state')
  return [{ kind: 'bytes', field: 'state', address: adapterAddress + offset, bytes }]
}
