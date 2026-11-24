// Packs server commands into the bytes of one adapter block, as Black 2's command queue writes
// them (#72). The commands, their formats and the message rules come in as a table that
// scripts/gen5-bw2.ts generates from the pinned pokebw2 checkout; this module holds none of the
// game's numbers. The queue writes every value high byte first (btl_server_cmd.c, PutU16 to
// PutU32), unlike the ARM9's own little-endian words. An argument wider than its field throws:
// the game's packer would mask it, and a cut value must never reach the screen.
import type { ArgPut, ServerCmdTable } from './bw2-numbers'

/** One command: its name (`SC_*`), its arguments, and for a message command its message ID and,
 * for the one command that carries it, a sound. */
export interface ServerCommand {
  command: string
  args: number[]
  message?: number
  sound?: number
}

/** The widths the queue writes outside the formats; scripts/gen5-bw2-put.ts checks the C for them
 * (PutCmdArgs starts with PutU16 of the command; PutMsg writes halfwords, then words). */
const COMMAND_BYTES = 2
const MESSAGE_BYTES = 2
const SOUND_BYTES = 2
const MESSAGE_ARG_BYTES = 4

/** Appends `value` in `bytes` bytes, high byte first; throws unless it fits. */
function pushBigEndian(out: number[], value: number, bytes: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** (bytes * 8)) {
    throw new RangeError(`${what} is ${String(value)}, which does not fit ${String(bytes)} bytes`)
  }
  for (let i = bytes - 1; i >= 0; i -= 1) out.push(Math.floor(value / 2 ** (i * 8)) % 256)
}

function putValue(put: ArgPut, args: readonly number[], command: string): number {
  let value = 0
  for (const field of put.fields) {
    const arg = args[field.arg] ?? Number.NaN
    if (!Number.isInteger(arg) || arg < 0 || arg > field.mask) {
      const at = `argument ${String(field.arg)} is ${String(arg)}`
      throw new RangeError(`${command}: ${at}, wider than its field of mask ${String(field.mask)}`)
    }
    value += arg * 2 ** field.shift
  }
  return value
}

function packFormatted(
  out: number[],
  table: ServerCmdTable,
  entry: ServerCommand,
  format: string,
): void {
  const { argCount, puts } = table.argFormats[format] ?? { argCount: -1, puts: [] }
  if (entry.message !== undefined || entry.sound !== undefined) {
    throw new Error(`${entry.command} takes no message and no sound (format ${format})`)
  }
  if (entry.args.length !== argCount) {
    const count = String(entry.args.length)
    throw new Error(`${entry.command} takes ${String(argCount)} arguments, not ${count}`)
  }
  for (const put of puts) {
    pushBigEndian(out, putValue(put, entry.args, entry.command), put.bytes, entry.command)
  }
}

function packMessage(out: number[], table: ServerCmdTable, entry: ServerCommand): void {
  const { soundCommand, argEnd } = table.messages
  if (entry.message === undefined) throw new Error(`${entry.command} needs a message ID`)
  pushBigEndian(out, entry.message, MESSAGE_BYTES, `${entry.command}'s message`)
  if ((entry.command === soundCommand) !== (entry.sound !== undefined)) {
    throw new Error(`${entry.command}: only ${soundCommand} carries a sound, and it always does`)
  }
  if (entry.sound !== undefined) {
    pushBigEndian(out, entry.sound, SOUND_BYTES, `${entry.command}'s sound`)
  }
  entry.args.forEach((arg, i) => {
    const what = `${entry.command}: argument ${String(i)}`
    if (arg === argEnd) throw new RangeError(`${what} equals the end marker`)
    pushBigEndian(out, arg, MESSAGE_ARG_BYTES, what)
  })
  pushBigEndian(out, argEnd, MESSAGE_ARG_BYTES, 'the end marker')
}

/** The bytes of one block: each command's number, then its arguments by its format. */
export function packCommands(
  table: ServerCmdTable,
  commands: readonly ServerCommand[],
): Uint8Array {
  const out: number[] = []
  for (const entry of commands) {
    const value = table.serverCommands[entry.command]
    const format = table.commandFormats[entry.command]
    if (value === undefined || format === undefined) {
      throw new Error(`${entry.command} is no server command with a format`)
    }
    pushBigEndian(out, value, COMMAND_BYTES, entry.command)
    if (table.messages.formats.includes(format)) packMessage(out, table, entry)
    else packFormatted(out, table, entry, format)
  }
  return Uint8Array.from(out)
}
