// The report of the pokebw2 generator (gen5-bw2.ts): the full one with every number it read, for a
// run on the build machine, and the quiet one for CI's public log, with no number of pokebw2.
import type { Bw2Numbers, Bw2Symbol } from '../src/gen5/bw2-numbers.ts'
import { inMainRam } from '../src/gen5/main-ram.ts'
import { packCommands, type ServerCommand } from '../src/gen5/server-cmd.ts'

/** The commands S6 sends for one battle moment. */
export const MOMENT_COMMANDS = [
  'SC_OP_SUBTRACT_HP',
  'SC_OP_ADD_HP',
  'SC_MOVE_ANIM',
  'SC_DAMAGE',
  'SC_UPDATE_HP_GAUGE',
  'SC_MOVE_MSG',
  'SC_MSG_STD',
  'SC_MSG_SET',
]

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

const symbolsOutside = (symbols: Readonly<Record<string, Bw2Symbol>>) =>
  Object.values(symbols).filter((symbol) => !inMainRam(symbol.address))

/** The symbols outside DS main RAM, each with its address. */
export function outsideMainRam(symbols: Readonly<Record<string, Bw2Symbol>>): string[] {
  return symbolsOutside(symbols).map((symbol) => `${symbol.name} ${hex(symbol.address)}`)
}

/** The names of the symbols outside DS main RAM. */
export function namesOutsideMainRam(symbols: Readonly<Record<string, Bw2Symbol>>): string[] {
  return symbolsOutside(symbols).map((symbol) => symbol.name)
}

/** `command` with zero arguments, as many as its format takes, or as a message with ID 0. */
export function zeroArguments(numbers: Bw2Numbers, command: string): ServerCommand {
  const format = numbers.commandFormats[command] ?? ''
  const count = numbers.argFormats[format]?.argCount ?? 0
  return numbers.messages.formats.includes(format)
    ? { command, message: 0, args: [] }
    : { command, args: Array.from({ length: count }, () => 0) }
}

/** Each moment command with zero arguments, packed through the generated table. */
function momentSamples(numbers: Bw2Numbers): string[] {
  return MOMENT_COMMANDS.map((command) => {
    const format = numbers.commandFormats[command] ?? ''
    const bytes = packCommands(numbers, [zeroArguments(numbers, command)]).length
    const value = String(numbers.serverCommands[command])
    return `moment ${command} = ${value}, ${format}, ${String(bytes)} bytes with zero arguments`
  })
}

const count = (table: object) => String(Object.keys(table).length)
const LAYOUT_CHECKED =
  'adapter layout checked: members present, offsets rising, inside the struct, bit-fields shared'

/** The report for a public log: the pin, the counts and the two checks, and no number of pokebw2:
 * no address, offset, value or size. */
export function quietLines(numbers: Bw2Numbers): string[] {
  const outside = namesOutsideMainRam(numbers.symbols)
  return [
    `pokebw2 ${numbers.pokebw2.commit}`,
    `symbols ${count(numbers.symbols)}, adapter commands ${count(numbers.adapterCommands)}, adapter states ${count(numbers.adapterStates)}`,
    `server commands ${count(numbers.serverCommands)}, formats ${count(numbers.argFormats)}, format table entries ${count(numbers.commandFormats)}`,
    outside.length === 0 ? 'all symbols in main RAM' : `outside main RAM: ${outside.join(', ')}`,
    LAYOUT_CHECKED,
  ]
}

/** The full report: every number the generator read, for a run on the build machine. */
export function fullLines(numbers: Bw2Numbers): string[] {
  const { adapter, adapterCommands, messages } = numbers
  return [
    `pokebw2 ${numbers.pokebw2.commit}`,
    ...Object.values(numbers.symbols).map(
      (symbol) => `symbol ${symbol.name} ${symbol.kind} ${hex(symbol.address)}`,
    ),
    `outside main RAM: ${outsideMainRam(numbers.symbols).join(', ') || 'none'}`,
    `adapter commands ${count(adapterCommands)}, SERVER_CMD ${String(adapterCommands.BTL_ACMD_SERVER_CMD)}`,
    `adapter states ${JSON.stringify(numbers.adapterStates)}`,
    `server commands ${count(numbers.serverCommands)}, formats ${count(numbers.argFormats)}`,
    `format table entries ${count(numbers.commandFormats)}, queue ${String(numbers.queueSize)}`,
    `messages ${JSON.stringify(messages)}`,
    `adapter size ${hex(adapter.size)}, align ${String(adapter.align)}`,
    ...Object.entries(adapter.fields).map(
      ([name, field]) => `field ${name} ${JSON.stringify(field)}`,
    ),
    LAYOUT_CHECKED,
    `battle ${JSON.stringify(numbers.battle)}`,
    ...momentSamples(numbers),
  ]
}

/** Prints the lines, each after the generator's prefix. */
export function report(lines: string[]): void {
  process.stdout.write(lines.map((line) => `gen5-bw2: ${line}\n`).join(''))
}
