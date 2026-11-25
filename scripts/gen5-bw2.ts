// Generates build/gen5/bw2.json, the Gen 5 spike's numbers of Black 2 (USA) (#72, D4), from
// pokebw2 at its pin (gen5-bw2-source.ts): the addresses S6 needs, the adapter and server command
// enums, each argument format's puts, the message rules, the adapter's layout and the route's
// places in the map's events. The checkout lives in .cache/gen5/pokebw2/ and the output in
// build/gen5/; nothing of pokebw2 is committed.
// Usage: node scripts/gen5-bw2.ts [--checkout <dir>] [--quiet] (fetches on the first run). With
// --quiet the report gives the pin, counts and checks and no number of pokebw2, as CI's public log
// needs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'

import type { ArgFormat, Bw2Numbers, FieldLayout, StructLayout } from '../src/gen5/bw2-numbers.ts'
import {
  defineValue,
  enumAround,
  parseFormatTable,
  parseSymbols,
  pickSymbols,
} from './gen5-bw2-c.ts'
import { battleNumbers } from './gen5-bw2-battle.ts'
import { ROUTE_MAP, routePlaces } from './gen5-bw2-field.ts'
import { parseArgFormats, parseMessageRules } from './gen5-bw2-put.ts'
import { fullLines, quietLines, report } from './gen5-bw2-report.ts'
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
  mainC: 'src/battle/btl_main.c',
  adapterH: 'include/battle/btl_adapter.h',
  queueH: 'include/battle/btl_server_cmd.h',
  serverH: 'include/battle/btl_server.h',
  mainH: 'include/battle/btl_main.h',
  pokeparamH: 'include/battle/btl_pokeparam.h',
  mapEvents: ROUTE_MAP.events,
  mapScript: ROUTE_MAP.script,
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
    route: routePlaces(sources.mapEvents, sources.mapScript),
  }
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
