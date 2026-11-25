// Generates build/gen5/bw2.json, the Gen 5 spike's numbers of Black 2 (USA) (#72, D4), from
// pokebw2 at its pin (gen5-bw2-source.ts): the addresses S6 needs, the adapter and server command
// enums, each argument format's puts, the message rules and the adapter's layout. The checkout
// lives in .cache/gen5/pokebw2/ and the output in build/gen5/; nothing of pokebw2 is committed.
// Usage: node scripts/gen5-bw2.ts [--checkout <dir>] [--quiet] (fetches on the first run). With
// --quiet the report gives the pin, counts and checks and no number of pokebw2, as CI's public log
// needs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'

import type {
  ArgFormat,
  Bw2Numbers,
  Bw2Symbol,
  FieldLayout,
  StructLayout,
} from '../src/gen5/bw2-numbers.ts'
import { inMainRam } from '../src/gen5/main-ram.ts'
import { packCommands, type ServerCommand } from '../src/gen5/server-cmd.ts'
import {
  defineValue,
  enumAround,
  parseFormatTable,
  parseSymbols,
  pickSymbols,
} from './gen5-bw2-c.ts'
import { battleNumbers } from './gen5-bw2-battle.ts'
import { parseArgFormats, parseMessageRules } from './gen5-bw2-put.ts'
import { checkout, listedReader, POKEBW2, type Pokebw2Read } from './gen5-bw2-source.ts'
import { structLayout } from './gen5-bw2-struct.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** The symbols the spike reads or names: the adapter list, the server's and the client's loops,
 * and the client's handlers of the commands S6 sends. All live in overlay 167. */
export const SYMBOL_NAMES = [
  'sAdapters',
  'sCommMode',
  'sCmdFormats',
  'sServerCmdTable',
  'BtlAdapter_SetCmd',
  'BtlAdapter_GetRecvCmd',
  'BtlAdapter_GetRecvData',
  'BtlAdapter_SetReturnData',
  'BattleServer_Main',
  'BattleServer_SetProc',
  'BattleServer_NoOp',
  'BattleServer_ProcSelectAction',
  'BattleServer_BroadcastCmdData',
  'BattleClient_MainProcNormal',
  'BattleClient_ServerCmdLoop',
  'BtlServerCmdQueue_Read',
  'BattleClient_ScOpSubtractHp',
  'BattleClient_ScOpAddHp',
  'BattleClient_ScMoveAnim',
  'BattleClient_ScDamage',
  'BattleClient_ScUpdateHpGauge',
  'BattleClient_ScMoveMsg',
  'BattleClient_ScMsgStd',
  'BattleClient_ScMsgSet',
  'BtlString_FormatMoveMsg',
  'BtlString_FormatStdMsgArgs',
]

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

/** The adapter's members that the spike reads or writes (src/gen5/adapter.ts, battle-check.ts). */
const ADAPTER_MEMBERS = [
  'returnData',
  'returnSize',
  'returned',
  'isNet',
  'clientId',
  'state',
  'cmd',
  'sendCmd.cmd',
  'sendCmd.size',
  'sendCmd.data',
]

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
const short = (value: number) => `0x${value.toString(16)}`

/** The byte and the bits a one-byte bit-field covers, or undefined for any other field. */
function bitsOf(
  field: FieldLayout | undefined,
): { offset: number; from: number; to: number } | undefined {
  if (field?.bit === undefined || field.bits === undefined || field.size !== 1) return undefined
  return { offset: field.offset, from: field.bit, to: field.bit + field.bits }
}

/** True when both are bit-fields of the same byte and their bits do not overlap. */
function shareOneByte(a: FieldLayout | undefined, b: FieldLayout | undefined): boolean {
  const [x, y] = [bitsOf(a), bitsOf(b)]
  if (x === undefined || y?.offset !== x.offset) return false
  return x.to <= y.from || y.to <= x.from
}

/** Throws when the adapter's layout looks misread: a member the spike needs is missing, an
 * offset falls back in declaration order, a member runs past the struct, or `returned` and
 * `isNet` are not two bit-fields of one byte. Needs no number of pokebw2. */
export function checkAdapterLayout(layout: StructLayout): void {
  const missing = ADAPTER_MEMBERS.filter((name) => layout.fields[name] === undefined)
  if (missing.length > 0) throw new Error(`the adapter's layout lacks ${missing.join(', ')}`)
  let last = 0
  for (const [name, field] of Object.entries(layout.fields)) {
    if (field.offset < last) {
      throw new Error(
        `${name} at ${short(field.offset)} lies before an earlier member at ${short(last)}`,
      )
    }
    if (field.offset + field.size > layout.size) {
      const end = short(field.offset + field.size)
      throw new Error(`${name} ends at ${end}, past the adapter's size ${short(layout.size)}`)
    }
    last = field.offset
  }
  if (!shareOneByte(layout.fields.returned, layout.fields.isNet)) {
    throw new Error('returned and isNet are not two bit-fields of one byte')
  }
}

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

/** The table's entries once every command below the bound has a known format. */
export function checkCommandFormats(
  commands: Readonly<Record<string, number>>,
  bound: string,
  entries: Readonly<Record<string, string>>,
  formats: Readonly<Record<string, ArgFormat>>,
): Record<string, string> {
  const limit = commands[bound]
  if (limit === undefined) throw new Error(`the format table's bound ${bound} is no command`)
  for (const [name, value] of Object.entries(commands)) {
    if (value < limit && entries[name] === undefined) {
      throw new Error(`${name} has no entry in the format table`)
    }
  }
  for (const [name, format] of Object.entries(entries)) {
    if (commands[name] === undefined) throw new Error(`the format table names ${name}, no command`)
    if (formats[format] === undefined) throw new Error(`${name}'s format ${format} is no format`)
  }
  return { ...entries }
}

/** The files the generator parses, by the role each plays. */
const SOURCES = {
  symbols: 'config/b2_us/arm9/overlays/ov167/symbols.txt',
  adapterC: 'src/battle/btl_adapter.c',
  queueC: 'src/battle/btl_server_cmd.c',
  serverC: 'src/battle/btl_server.c',
  adapterH: 'include/battle/btl_adapter.h',
  queueH: 'include/battle/btl_server_cmd.h',
  serverH: 'include/battle/btl_server.h',
  mainH: 'include/battle/btl_main.h',
  pokeparamH: 'include/battle/btl_pokeparam.h',
}

type Sources = Record<keyof typeof SOURCES, string>

/** Every file the generator parses, read through `read` before any parsing. */
export function readSources(read: Pokebw2Read): Sources {
  const entries = Object.entries(SOURCES).map(([role, path]) => [role, read(path)])
  return Object.fromEntries(entries) as Sources
}

function parse(sources: Sources): Bw2Numbers {
  const { adapterC, queueC, queueH } = sources
  const ov167 = parseSymbols(sources.symbols, 'ov167')
  const serverCommands = enumAround(queueH, 'SC_MOVE_MSG')
  const messages = parseMessageRules(queueC, defineValue(queueH, 'SC_MSG_ARG_END'))
  const codes = enumAround(queueC, 'SC_ARGS_NONE')
  const argFormats = parseArgFormats(queueC, codes, messages.formats)
  const table = parseFormatTable(queueC, 'sCmdFormats')
  const adapter = structLayout(adapterC, 'BtlAdapter')
  checkAdapterLayout(adapter)
  return {
    pokebw2: { ...POKEBW2 },
    symbols: pickSymbols(ov167, SYMBOL_NAMES),
    adapterCommands: enumAround(sources.adapterH, 'BTL_ACMD_SERVER_CMD'),
    adapterStates: enumAround(adapterC, 'BTL_ADAPTER_STATE_SEND'),
    serverCommands,
    argFormats,
    commandFormats: checkCommandFormats(serverCommands, table.bound, table.entries, argFormats),
    messages,
    queueSize: defineValue(queueH, 'BTL_SERVER_CMD_QUE_SIZE'),
    adapter,
    battle: battleNumbers(sources),
  }
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

function fullLines(numbers: Bw2Numbers): string[] {
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

function report(lines: string[]): void {
  process.stdout.write(lines.map((line) => `gen5-bw2: ${line}\n`).join(''))
}

function main(): void {
  const { values } = parseArgs({
    options: {
      checkout: { type: 'string', default: GEN5_PATHS.pokebw2 },
      quiet: { type: 'boolean', default: false },
    },
  })
  const numbers = parse(readSources(listedReader(checkout(values.checkout))))
  mkdirSync(dirname(GEN5_PATHS.bw2Json), { recursive: true })
  writeFileSync(GEN5_PATHS.bw2Json, `${JSON.stringify(numbers, null, 2)}\n`)
  report([
    ...(values.quiet ? quietLines(numbers) : fullLines(numbers)),
    'wrote build/gen5/bw2.json',
  ])
}

if (import.meta.main) main()
