// The S6 run of the Gen 5 spike (#72) and its run from the shipped save (#78): one battle moment
// driven from outside. It starts the session as gen5-moment-args.ts says: from the spike's battle
// state, or from boot with a save the page fetches from /saves/ and the continue route to the
// trainer's action menu. Then it reads the player's adapter, the server and both Pokémon from main
// RAM and plays the steps of gen5-moment-plan.ts: hold the server, answer the action menu and
// write one block per moment. It writes a frame per mark under build/gen5/frames/ and the last
// mark's state under build/gen5/states/ (gitignored, ADR 0002).
// Usage: GEN5_DUMP=<path> node scripts/gen5-moment.ts [--scene known|unknown] [--save <name>]
// [--minutes 15].
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Dex } from '@pkmn/dex'
import { chromium, type Page } from '@playwright/test'

import { adapterNumbers } from '../src/gen5/adapter.ts'
import { battleRefs } from '../src/gen5/battle-check.ts'
import { type BattleMonReading, findServers, frontMon } from '../src/gen5/battle-mons.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { Gen5Global, MarkRecord, RunPlan, RunReport } from '../src/gen5/hook.ts'
import { MAIN_RAM_SIZE, MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import type { RamRef } from '../src/gen5/ram-check.ts'
import {
  firstRun,
  type MomentOptions,
  readMomentOptions,
  type StateFile,
} from './gen5-moment-args.ts'
import { momentSteps } from './gen5-moment-plan.ts'
import { listedReader } from './gen5-bw2-source.ts'
import {
  moveLineLabel,
  sceneBlocks,
  sceneMove,
  TEXT_BANKS,
  textId,
  textLine,
} from './gen5-moment-scene.ts'
import { log, logSave, sampleLine, waitForStart } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { logStorage, type RequestLog, watchRequests } from './gen5-requests.ts'
import { CHROMIUM_ARGS, PAGE_HOST, RUN_VIEWPORT, serve } from './gen5-shot.ts'

const POLL_MS = 1000
const hex = (value: number) => `0x${value.toString(16)}`
/** The page's hook; spelled out in each evaluate, since those run in the page, not here. */
const hook = (page: Page) => ({
  readBytes: (at: number, n: number) =>
    page.evaluate(([a, l]) => (globalThis as unknown as Gen5Global).gen5.readBytes(a, l), [
      at,
      n,
    ] as const),
  takeMark: (name: string) =>
    page.evaluate((mark) => (globalThis as unknown as Gen5Global).gen5.takeMark(mark), name),
  queueRun: (plan: RunPlan) =>
    page.evaluate((queued) => {
      ;(globalThis as unknown as Gen5Global).gen5.queueRun(queued)
    }, plan),
  runReport: () => page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.runReport()),
  uncapped: () =>
    page.evaluate(() => {
      ;(globalThis as unknown as Gen5Global).gen5.uncapped(true)
    }),
})

interface Battle {
  adapter: number
  server: number
  near: BattleMonReading
  far: BattleMonReading
}

function symbol(numbers: Bw2Numbers, name: string): number {
  const found = numbers.symbols[name]
  if (!found) throw new Error(`bw2.json names no ${name}`)
  return found.address
}

const readPokebw2 = listedReader(GEN5_PATHS.pokebw2)
const bank = (name: keyof typeof TEXT_BANKS) => readPokebw2(TEXT_BANKS[name])

/** Main RAM once, and from it the adapter, the one server and both front Pokémon. */
async function readBattle(page: Page, numbers: Bw2Numbers): Promise<Battle> {
  const base64 = await hook(page).readBytes(MAIN_RAM_START, MAIN_RAM_SIZE)
  const ram = Buffer.from(base64, 'base64')
  const read = (address: number, width: 1 | 2 | 4) =>
    ram.readUIntLE(address - MAIN_RAM_START, width)
  const adapter = read(symbol(numbers, 'sAdapters'), 4)
  const proc = symbol(numbers, 'BattleServer_ProcSelectAction')
  const servers = findServers(new Uint8Array(ram), MAIN_RAM_START, proc, numbers.battle)
  log(`servers waiting for the actions: ${servers.map(hex).join(' ') || 'none'}`)
  const [server] = servers
  if (servers.length !== 1 || server === undefined) throw new Error('need exactly one server')
  const near = frontMon(read, server, numbers.battle, 0)
  const far = frontMon(read, server, numbers.battle, 1)
  for (const [side, mon] of [
    ['near', near],
    ['far', far],
  ] as const) {
    const name =
      Dex.forGen(5)
        .species.all()
        .find((s) => s.num === mon.species)?.name ?? '?'
    log(
      `${side}: ${name} (${String(mon.species)}) L${String(mon.level)} mon ID ${String(mon.monId)}, HP ${String(mon.hp)}/${String(mon.maxHp)} at ${hex(mon.address)}`,
    )
  }
  return { adapter, server, near, far }
}

function watchOf(numbers: Bw2Numbers, battle: Battle): RamRef[] {
  const field = (
    layout: { fields: Record<string, { offset: number } | undefined> },
    name: string,
  ) => layout.fields[name]?.offset ?? 0
  const hp = field(numbers.battle.monCore, 'hp')
  return [
    ...battleRefs(numbers).watch,
    {
      name: 'server.proc',
      address: battle.server + field(numbers.battle.server, 'proc'),
      width: 4,
    },
    { name: 'server.seq', address: battle.server + field(numbers.battle.server, 'seq'), width: 4 },
    { name: 'near.hp', address: battle.near.address + hp, width: 2 },
    { name: 'far.hp', address: battle.far.address + hp, width: 2 },
  ]
}

/** Writes a mark's frame, and its state if the page kept one. */
async function saveMark(page: Page, record: MarkRecord, label: string): Promise<void> {
  const taken = await hook(page).takeMark(record.name)
  const base = `${label}-${record.name}`
  const saved = [`${base}.png`]
  if (taken?.shot) {
    writeFileSync(join(GEN5_PATHS.frames, `${base}.png`), Buffer.from(taken.shot, 'base64'))
  }
  if (taken?.state) {
    writeFileSync(join(GEN5_PATHS.states, `${base}.state`), Buffer.from(taken.state, 'base64'))
    const meta = { mark: record.name, frame: record.frame, ramSha: record.ramSha }
    writeFileSync(join(GEN5_PATHS.states, `${base}.json`), `${JSON.stringify(meta)}\n`)
    saved.push(`${base}.state`)
  }
  const wall = (record.wallMs / 1000).toFixed(1)
  log(`mark ${record.name}: frame ${String(record.frame)}, ${wall} s; ${saved.join(', ')}`)
}

/** The run's report each POLL_MS, its new marks written, until it ends or the deadline passes.
 * The page's report keeps the marks of the session's earlier runs; `known` of them are written. */
async function follow(page: Page, label: string, deadline: number, known = 0) {
  let written = known
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const report: RunReport = await hook(page).runReport()
    for (const record of report.marks.slice(written)) await saveMark(page, record, label)
    written = report.marks.length
    const ended = report.status === 'done' || report.status === 'failed'
    if (ended || Date.now() > deadline) return report
  }
}

function logReport(report: RunReport): void {
  log(
    `run ${report.status} at frame ${String(report.frame)}, step ${String(report.step)}; jumps ${String(report.jumps)}`,
  )
  if (report.failed !== undefined) log(`failed: ${report.failed}`)
  if (report.loadCheck !== undefined) log(`load check: ${report.loadCheck}`)
  for (const line of report.watch) log(`watch ${line}`)
}

function readStateFile(base: string): StateFile {
  const meta = JSON.parse(readFileSync(join(GEN5_PATHS.states, `${base}.json`), 'utf8')) as {
    frame: number
    ramSha: string | undefined
  }
  const state = readFileSync(join(GEN5_PATHS.states, `${base}.state`)).toString('base64')
  return { state, frame: meta.frame, ramSha: meta.ramSha }
}

/** Picks the dump and plays the first run to where the moment starts. A run from boot is queued
 * before the pick, so it counts from the first frame; a run from a state once the game is up. */
async function startSession(page: Page, dump: string, numbers: Bw2Numbers, options: MomentOptions) {
  const { start } = options
  const first = firstRun(start, battleRefs(numbers), readStateFile)
  const fromBoot = start.from === 'boot'
  const from = start.from === 'boot' ? `boot with the save ${start.save}` : `state ${start.state}`
  log(`first run: ${String(first.steps.length)} steps from ${from}`)
  if (fromBoot) await hook(page).queueRun(first)
  await page.setInputFiles('#dump', dump)
  await waitForStart(page)
  await logSave(page, 'at the start')
  if (!fromBoot) await hook(page).queueRun(first)
  return follow(page, options.label, options.deadlineMs)
}

async function play(page: Page, dump: string, numbers: Bw2Numbers, options: MomentOptions) {
  const { scene, label, deadlineMs } = options
  const first = await startSession(page, dump, numbers, options)
  logReport(first)
  if (first.status !== 'done') return 1
  await hook(page).uncapped()
  const battle = await readBattle(page, numbers)
  log(`adapter ${hex(battle.adapter)}, server ${hex(battle.server)}`)
  const std = textId(bank('standard'), 'Bank0019_Text_ItsSuperEffective')
  const blocks = sceneBlocks(scene, battle, numbers.battle.single, std)
  for (const { name, moment } of blocks) {
    const side = moment.attacker.monId === battle.near.monId ? 'near' : 'far'
    const line = moveLineLabel(sceneMove(scene, side), side)
    log(
      `${name}: ${JSON.stringify(moment)}; ${line}: ${textLine(bank('move'), textId(bank('move'), line))}`,
    )
  }
  log(`standard line ${String(std)}: ${textLine(bank('standard'), std)}`)
  const steps = momentSteps({
    adapterNumbers: adapterNumbers(numbers),
    table: numbers,
    adapter: battle.adapter,
    blocks,
  })
  for (const step of steps) {
    if (step.kind === 'write')
      for (const w of step.writes)
        log(
          `step write ${step.name}: ${w.field} @${hex(w.address)} ${w.kind === 'bytes' ? w.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ') : `bits ${hex(w.mask)}=${String(w.value)}`}`,
        )
  }
  const second: RunPlan = {
    steps,
    startFrame: 0,
    watch: watchOf(numbers, battle),
    stateMarks: ['end'],
  }
  await hook(page).queueRun(second)
  const report = await follow(page, label, deadlineMs, first.marks.length)
  logReport(report)
  return report.status === 'done' ? 0 : 1
}

async function main(): Promise<void> {
  const options = readMomentOptions(process.argv.slice(2), Date.now())
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  log(`gen5-moment: ${JSON.stringify(options)}; ${sampleLine()}`)
  const numbers = JSON.parse(readFileSync(GEN5_PATHS.bw2Json, 'utf8')) as Bw2Numbers
  const served = await serve(false)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  let requests: RequestLog | undefined
  try {
    const page = await (await browser.newContext({ viewport: RUN_VIEWPORT })).newPage()
    requests = watchRequests(page, origin, false)
    await page.goto(`${origin}/${options.start.from === 'boot' ? options.start.query : ''}`)
    process.exitCode = await play(page, dump, numbers, options)
    await logSave(page, 'at the end')
    if (!(await logStorage(page))) process.exitCode = 1
  } finally {
    await browser.close()
    await served.close()
    log(sampleLine())
    if (requests) log(requests.summary())
  }
  if (requests.failed) process.exitCode = 1
}

if (import.meta.main) await main()
