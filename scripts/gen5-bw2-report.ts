// The report of the pokebw2 generator (gen5-bw2.ts): the full one with every number it read, for a
// run on the build machine, and the quiet one for CI's public log, with no number of pokebw2.
import { GEN5_LINES } from '../src/gen5/backend/lines.ts'
import type {
  Bw2Numbers,
  Bw2Symbol,
  EntryNumbers,
  PkmNumbers,
  TextNumbers,
} from '../src/gen5/bw2-numbers.ts'
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

/** The direct entry's checks by name: its ARM functions, its symbols outside main RAM, and the
 * battle overlay's span, which the generator has already checked against the boot overlays. */
function entryChecks(entry: EntryNumbers): string[] {
  const functions = Object.entries(entry.functions)
  const arm = functions.filter(([, fn]) => !fn.thumb).map(([name]) => name)
  const outside = [
    ...functions.filter(([, fn]) => !inMainRam(fn.call - (fn.thumb ? 1 : 0))).map(([name]) => name),
    ...namesOutsideMainRam(entry.data),
  ]
  const { start, end } = entry.battleOverlay
  const span = inMainRam(start, end - start) ? 'in main RAM' : 'outside main RAM'
  return [
    arm.length === 0 ? 'entry functions all Thumb' : `entry functions in ARM: ${arm.join(', ')}`,
    outside.length === 0
      ? 'entry symbols all in main RAM'
      : `entry symbols outside main RAM: ${outside.join(', ')}`,
    `battle overlay ${span}, apart from the boot overlays`,
    `entry layouts ${Object.keys(entry.layouts).join(', ')}`,
  ]
}

/** A Pokémon's format by name: the generator has read and checked the rest or thrown. */
const pkmCheck = (pkm: PkmNumbers) =>
  `pkm layouts ${Object.keys(pkm.layouts).join(', ')}; block table, cipher and shiny bound read`

/** How many of the backend's lines each bank holds by label, of how many it names: counts of our
 * own list, as a bank's own size would give away its last line's index. */
function textCheck(text: TextNumbers): string {
  const lines = Object.values(GEN5_LINES)
  const banks = (['standard', 'set'] as const).map((bank) => {
    const named = lines.filter((line) => line.bank === bank)
    const found = named.filter((line) => Object.hasOwn(text[bank], line.label))
    return `${bank} ${String(found.length)} of ${String(named.length)}`
  })
  return `text labels of the backend's lines found: ${banks.join(', ')}`
}

/** The report for a public log: the pin, the count of the symbols it looked up by our own names,
 * and the two checks, and no number of pokebw2: no address, offset, value or size. Each of
 * pokebw2's lists runs from 0, so a list's size would give away its last entry's number. */
export function quietLines(numbers: Bw2Numbers): string[] {
  const outside = namesOutsideMainRam(numbers.symbols)
  return [
    `pokebw2 ${numbers.pokebw2.commit}`,
    `symbols ${count(numbers.symbols)}`,
    outside.length === 0 ? 'all symbols in main RAM' : `outside main RAM: ${outside.join(', ')}`,
    LAYOUT_CHECKED,
    ...entryChecks(numbers.entry),
    pkmCheck(numbers.pkm),
    textCheck(numbers.text),
  ]
}

/** Every number of a Pokémon's format, for a run on the build machine. */
function pkmLines(pkm: PkmNumbers): string[] {
  const { species, moves, items, abilities, natures } = pkm
  const lists = Object.entries({ species, moves, items, abilities, natures })
  return [
    ...Object.entries(pkm.layouts).map(
      ([name, layout]) =>
        `pkm layout ${name} size ${hex(layout.size)}, align ${String(layout.align)}`,
    ),
    `pkm block columns ${JSON.stringify(pkm.blockColumns)}`,
    `pkm block table ${JSON.stringify(pkm.blockOffsets)}`,
    `pkm selector ${JSON.stringify(pkm.selector)}, cipher ${JSON.stringify(pkm.cipher)}`,
    `pkm shiny below ${String(pkm.shinyBelow)}, constants ${JSON.stringify(pkm.constants)}`,
    `pkm lists ${lists.map(([name, list]) => `${name} ${count(list)}`).join(', ')}`,
  ]
}

/** Every number of the direct entry, for a run on the build machine. */
function entryLines(entry: EntryNumbers): string[] {
  const span = ({ start, end }: { start: number; end: number }) => `${hex(start)} to ${hex(end)}`
  return [
    ...Object.entries(entry.functions).map(
      ([name, fn]) => `entry function ${name} ${fn.thumb ? 'thumb' : 'arm'} ${hex(fn.call)}`,
    ),
    ...Object.values(entry.data).map(
      (symbol) => `entry data ${symbol.name} ${symbol.module} ${hex(symbol.address)}`,
    ),
    `entry constants ${JSON.stringify(entry.constants)}`,
    `entry buffer sizes ${JSON.stringify(entry.bufferSizes)}`,
    ...Object.entries(entry.layouts).map(
      ([name, layout]) =>
        `entry layout ${name} size ${hex(layout.size)}, align ${String(layout.align)}`,
    ),
    `battle overlay ${span(entry.battleOverlay)}`,
    ...Object.entries(entry.bootOverlays).map(([name, at]) => `boot overlay ${name} ${span(at)}`),
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
    ...entryLines(numbers.entry),
    ...entryChecks(numbers.entry),
    ...pkmLines(numbers.pkm),
    `text standard ${count(numbers.text.standard)} labels, set ${count(numbers.text.set)} labels`,
    ...Object.entries(GEN5_LINES).map(
      ([name, line]) => `line ${name} ${line.label} ${String(numbers.text[line.bank][line.label])}`,
    ),
  ]
}

/** Prints the lines, each after the generator's prefix. */
export function report(lines: string[]): void {
  process.stdout.write(lines.map((line) => `gen5-bw2: ${line}\n`).join(''))
}
