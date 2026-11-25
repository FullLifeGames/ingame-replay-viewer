// The S6 run of the Gen 5 spike (#72): one battle moment driven from outside. It loads the battle
// state of S5, reads the player's adapter, the server and both Pokémon from main RAM, then plays
// the steps of gen5-moment-plan.ts: hold the server, answer the action menu and write one block
// per moment. It writes a frame per mark under
// build/gen5/frames/ and the last mark's state under build/gen5/states/ (gitignored, ADR 0002).
// Usage: GEN5_DUMP=<path> node scripts/gen5-moment.ts [--scene known|unknown] [--minutes 15].
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { Dex } from '@pkmn/dex'
import { chromium, type Page } from '@playwright/test'

import { adapterNumbers } from '../src/gen5/adapter.ts'
import { battleRefs } from '../src/gen5/battle-check.ts'
import { type BattleMonReading, findServers, frontMon } from '../src/gen5/battle-mons.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { Gen5Global, MarkRecord, RunPlan, RunReport } from '../src/gen5/hook.ts'
import { MAIN_RAM_SIZE, MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import type { RamRef } from '../src/gen5/ram-check.ts'
import { momentSteps } from './gen5-moment-plan.ts'
import { type SceneName, sceneBlocks, textId, textLine } from './gen5-moment-scene.ts'
import { log, sampleLine, waitForStart } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { CHROMIUM_ARGS, PAGE_HOST, RUN_VIEWPORT, serve, watchRequests } from './gen5-shot.ts'

const FROM = 's5-battle'
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

const bank = (number: string) =>
  readFileSync(join(GEN5_PATHS.pokebw2, `res/text/system/${number}.txt`), 'utf8')

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

async function runPlan(page: Page, plan: RunPlan, label: string, deadline: number) {
  await hook(page).queueRun(plan)
  let written = 0
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

async function play(page: Page, numbers: Bw2Numbers, scene: SceneName, deadline: number) {
  const meta = JSON.parse(readFileSync(join(GEN5_PATHS.states, `${FROM}.json`), 'utf8')) as {
    frame: number
    ramSha: string
  }
  const state = readFileSync(join(GEN5_PATHS.states, `${FROM}.state`)).toString('base64')
  const watch = battleRefs(numbers).watch
  const first: RunPlan = {
    steps: [{ kind: 'wait', frames: 2 }],
    state,
    stateSha: meta.ramSha,
    startFrame: meta.frame,
    watch,
    stateMarks: [],
  }
  logReport(await runPlan(page, first, `s6-${scene}`, deadline))
  const battle = await readBattle(page, numbers)
  log(`adapter ${hex(battle.adapter)}, server ${hex(battle.server)}`)
  const std = textId(bank('0019'), 'Bank0019_Text_ItsSuperEffective')
  const blocks = sceneBlocks(scene, battle, std)
  for (const { name, moment } of blocks) {
    const variant = moment.attacker.monId === battle.near.monId ? 0 : 2
    log(
      `${name}: ${JSON.stringify(moment)}; bank 16 line ${String(moment.move * 3 + variant)}: ${textLine(bank('0016'), moment.move * 3 + variant)}`,
    )
  }
  log(`standard line ${String(std)}: ${textLine(bank('0019'), std)}`)
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
  const report = await runPlan(page, second, `s6-${scene}`, deadline)
  logReport(report)
  return report.status === 'done' ? 0 : 1
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      scene: { type: 'string', default: 'known' },
      minutes: { type: 'string', default: '15' },
    },
  })
  const scene = values.scene === 'unknown' ? 'unknown' : 'known'
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  log(`gen5-moment: scene ${scene}; ${sampleLine()}`)
  const numbers = JSON.parse(readFileSync(GEN5_PATHS.bw2Json, 'utf8')) as Bw2Numbers
  const served = await serve(false)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  const refused: string[] = []
  try {
    const page = await (await browser.newContext({ viewport: RUN_VIEWPORT })).newPage()
    watchRequests(page, origin, false, refused)
    await page.goto(`${origin}/`)
    await page.setInputFiles('#dump', dump)
    await waitForStart(page)
    await hook(page).uncapped()
    process.exitCode = await play(
      page,
      numbers,
      scene,
      Date.now() + Number(values.minutes) * 60_000,
    )
  } finally {
    await browser.close()
    await served.close()
  }
  log(
    `${sampleLine()}; requests: ${refused.length === 0 ? 'all local' : `${String(refused.length)} refused`}`,
  )
}

if (import.meta.main) await main()
