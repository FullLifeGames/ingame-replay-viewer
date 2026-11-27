// Generates build/gen5/bw2.json, the Gen 5 spike's numbers of Black 2 (USA) (#72, D4), from
// pokebw2 at its pin (gen5-bw2-source.ts): the addresses S6 needs, the adapter and server command
// enums, each argument format's puts, the message rules, the adapter's layout, the route's places
// in the map's events, the tile of the shipped save's trainer, the player's client and the
// opponent's with each side's setup index (#93), the direct entry's numbers and a Pokémon's data
// format (#97), the battle's constants, the mon-ID rule, the setup flag and the characters of the
// battle's fonts (#106), the labels of the battle's standard and set text banks, each line the
// backend sends held to what its function puts, and the flow's damage kinds and heal effect (#107),
// recall effects and faint flag (#108), and the numbers of the effects' sequences and the lines of
// the effects (#109).
// The checkout lives in .cache/gen5/pokebw2/ and the output in build/gen5/; nothing of pokebw2 is
// committed.
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
import { EFFECT_SOURCES, effectNumbers } from './gen5-bw2-effects.ts'
import { checkPartyRoom } from './gen5-bw2-mon-ids.ts'
import { checkPlayerClient } from './gen5-bw2-clients.ts'
import { BATTLE_OVERLAY, BOOT_LINKS, ENTRY_SOURCES, entryNumbers } from './gen5-bw2-entry.ts'
import { FLOW_SOURCES, flowNumbers } from './gen5-bw2-flow.ts'
import { checkBackendLines } from './gen5-bw2-lines.ts'
import { FONT_SOURCES, fontNumbers } from './gen5-bw2-font.ts'
import { ROUTE_MAP, routePlaces } from './gen5-bw2-field.ts'
import { PKM_SOURCES, pkmNumbers } from './gen5-bw2-pkm.ts'
import { parseArgFormats, parseMessageRules } from './gen5-bw2-put.ts'
import { fullLines, quietLines, report } from './gen5-bw2-report.ts'
import { checkout, listedReader, POKEBW2, type Pokebw2Read } from './gen5-bw2-source.ts'
import { structLayout } from './gen5-bw2-struct.ts'
import { TEXT_SOURCES, textNumbers } from './gen5-bw2-text.ts'
import { SAVE_TRAINER, saveTrainer } from './gen5-bw2-trainer.ts'
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
  symbols: `config/b2_us/arm9/overlays/${BATTLE_OVERLAY}/symbols.txt`,
  adapterC: 'src/battle/btl_adapter.c',
  queueC: 'src/battle/btl_server_cmd.c',
  serverC: 'src/battle/btl_server.c',
  mainC: 'src/battle/btl_main.c',
  adapterH: 'include/battle/btl_adapter.h',
  queueH: 'include/battle/btl_server_cmd.h',
  serverH: 'include/battle/btl_server.h',
  mainH: 'include/battle/btl_main.h',
  clientH: 'include/battle/btl_client.h',
  pokeparamH: 'include/battle/btl_pokeparam.h',
  mapEvents: ROUTE_MAP.events,
  mapScript: ROUTE_MAP.script,
  trainerEvents: SAVE_TRAINER.events,
  trainerList: SAVE_TRAINER.trainers,
  trainerScript: SAVE_TRAINER.script,
  ...ENTRY_SOURCES,
  ...PKM_SOURCES,
  ...FONT_SOURCES,
  ...TEXT_SOURCES,
  ...FLOW_SOURCES,
  ...EFFECT_SOURCES,
}

type Sources = Record<keyof typeof SOURCES, string> & { bootLinks: Record<string, string> }

const readAll = (read: Pokebw2Read, paths: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(paths).map(([role, path]) => [role, read(path)]))

/** Every file the generator parses, read through `read` before any parsing: the link files of
 * the boot overlays by overlay name. */
export function readSources(read: Pokebw2Read): Sources {
  return { ...readAll(read, SOURCES), bootLinks: readAll(read, BOOT_LINKS) } as Sources
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
  const battle = battleNumbers(sources)
  checkPlayerClient(battle.single.clients, sources.setupC)
  const pkm = pkmNumbers(sources)
  checkPartyRoom(battle.monIds, pkm.constants.PARTY_SIZE ?? Infinity)
  const text = textNumbers(sources)
  checkBackendLines(sources, text)
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
    battle,
    route: routePlaces(sources.mapEvents, sources.mapScript),
    saveTrainer: saveTrainer({
      events: sources.trainerEvents,
      trainers: sources.trainerList,
      script: sources.trainerScript,
    }),
    entry: entryNumbers({
      ...sources,
      battleSymbols: sources.symbols,
      battleOverlay: BATTLE_OVERLAY,
    }),
    pkm,
    font: fontNumbers(sources),
    text,
    flow: flowNumbers(sources),
    effects: effectNumbers(sources, battle.constants),
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
