// The S5 run of the Gen 5 spike (#72): plays the route of src/gen5/route.ts on the spike page in
// headless Chromium, from boot or from a state saved at one of its marks, up to a mark or its
// end. At each mark the page saves a state and the core's frame; this script writes them to
// build/gen5/states/ and build/gen5/frames/ (gitignored, ADR 0002; never served or committed) and
// logs the emulated frame, the wall time and a hash of main RAM. Requests stay on the machine as
// in scripts/gen5-shot.ts. Usage: GEN5_DUMP=<path> node scripts/gen5-route.ts [--from <mark>]
// [--to <mark>] [--label s5] [--uncapped] [--minutes 18].
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { chromium, type Page } from '@playwright/test'

import { battleRefs } from '../src/gen5/battle-check.ts'

type BattleRefs = ReturnType<typeof battleRefs>
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { Gen5Global, MarkRecord, RunPlan, RunReport } from '../src/gen5/hook.ts'
import { routeSlice } from '../src/gen5/macro.ts'
import { maskedValue, type RamRef, refAddress } from '../src/gen5/ram-check.ts'
import { newGameRoute, PLAYER_X, PLAYER_Z } from '../src/gen5/route.ts'
import { log, sampleLine, waitForStart } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { CHROMIUM_ARGS, PAGE_HOST, RUN_VIEWPORT, serve, watchRequests } from './gen5-shot.ts'

interface RouteOptions {
  from: string | undefined
  to: string | undefined
  label: string
  uncapped: boolean
  deadlineMs: number
}

/** What a run writes beside a state: where in the route it was saved. */
interface StateMeta {
  mark: string
  frame: number
  ramSha: string | undefined
}

const REPORT_EVERY_MS = 2000
const hex = (value: number) => `0x${value.toString(16).toUpperCase()}`

const hook = (page: Page) => ({
  report: () => page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.runReport()),
  take: (name: string) =>
    page.evaluate((mark) => (globalThis as unknown as Gen5Global).gen5.takeMark(mark), name),
  word: (address: number) =>
    page.evaluate((at) => (globalThis as unknown as Gen5Global).gen5.readWord(at), address),
})

function readPlan(options: RouteOptions, refs: BattleRefs): RunPlan {
  const { watch } = refs
  const steps = routeSlice(newGameRoute(refs.checks), options.from, options.to)
  const markRefs = [PLAYER_X, PLAYER_Z]
  if (options.from === undefined) return { steps, startFrame: 0, watch, markRefs }
  const base = join(GEN5_PATHS.states, `s5-${options.from}`)
  const meta = JSON.parse(readFileSync(`${base}.json`, 'utf8')) as StateMeta
  const state = readFileSync(`${base}.state`).toString('base64')
  log(`from state s5-${options.from}: frame ${String(meta.frame)}, main RAM ${String(meta.ramSha)}`)
  return { steps, state, stateSha: meta.ramSha, startFrame: meta.frame, watch, markRefs }
}

function writeMeta(label: string, record: MarkRecord): void {
  const meta: StateMeta = { mark: record.name, frame: record.frame, ramSha: record.ramSha }
  writeFileSync(
    join(GEN5_PATHS.states, `${label}-${record.name}.json`),
    `${JSON.stringify(meta)}\n`,
  )
}

function markLine(record: MarkRecord): string {
  const wall = (record.wallMs / 1000).toFixed(1)
  return `mark ${record.name}: frame ${String(record.frame)} (page ${String(record.pageFrame)}), ${wall} s into the run, state ${String(record.stateBytes)} bytes, ${record.values}, main RAM sha256 ${record.ramSha ?? 'pending'}`
}

/** Writes each new mark's state and frame; returns how many marks are written now. */
async function saveMarks(page: Page, report: RunReport, written: number, label: string) {
  for (const record of report.marks.slice(written)) {
    const taken = await hook(page).take(record.name)
    const base = `${label}-${record.name}`
    if (taken) {
      writeFileSync(join(GEN5_PATHS.states, `${base}.state`), Buffer.from(taken.state, 'base64'))
      writeFileSync(join(GEN5_PATHS.frames, `${base}.png`), Buffer.from(taken.shot, 'base64'))
      writeMeta(label, record)
    }
    log(`${markLine(record)}; ${taken ? `saved ${base}.state and ${base}.png` : 'NOT TAKEN'}`)
  }
  return report.marks.length
}

/** The run's report each REPORT_EVERY_MS until it ends or the deadline passes. */
async function follow(page: Page, options: RouteOptions): Promise<RunReport> {
  let written = 0
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, REPORT_EVERY_MS))
    const report = await hook(page).report()
    written = await saveMarks(page, report, written, options.label)
    const ended = report.status === 'done' || report.status === 'failed'
    if (ended || Date.now() > options.deadlineMs) {
      if (!ended)
        log(`deadline: stopped at frame ${String(report.frame)}, step ${String(report.step)}`)
      return report
    }
  }
}

/** A watched value read once from outside, through aligned words, for the end's readings; the
 * pointer, offset and mask follow ram-check.ts's rule. */
async function readRaw(page: Page, ref: RamRef): Promise<string> {
  const pointer = ref.offset === undefined ? 0 : await hook(page).word(ref.address)
  const at = refAddress(ref, pointer)
  if (at === undefined) return 'none'
  const word = await hook(page).word(at - (at % 4))
  const shifted = Math.floor(word / 2 ** ((at % 4) * 8))
  const value = ref.width === 4 ? word : shifted % 2 ** (ref.width * 8)
  return hex(maskedValue(ref, value))
}

async function readOnce(page: Page, ref: RamRef): Promise<string> {
  try {
    return await readRaw(page, ref)
  } catch (error) {
    return `unread (${String(error).split('\n')[0] ?? ''})`
  }
}

async function logEnd(page: Page, options: RouteOptions, watch: RamRef[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, REPORT_EVERY_MS))
  const report = await hook(page).report()
  log(
    `run ${report.status} at frame ${String(report.frame)}, step ${String(report.step)}; frames the hook did not see: ${String(report.jumps)}`,
  )
  if (report.failed !== undefined) log(`failed: ${report.failed}`)
  if (report.loadCheck !== undefined) log(`load check: ${report.loadCheck}`)
  for (const record of report.marks) log(markLine(record))
  for (const line of report.watch) log(`watch ${line}`)
  const readings = await Promise.all(
    watch.map(async (ref) => `${ref.name}=${await readOnce(page, ref)}`),
  )
  log(`readings at the end: ${readings.join(' ')}`)
  for (const record of report.marks) writeMeta(options.label, record)
}

async function run(dump: string, options: RouteOptions): Promise<number> {
  mkdirSync(GEN5_PATHS.frames, { recursive: true })
  mkdirSync(GEN5_PATHS.states, { recursive: true })
  const numbers = JSON.parse(readFileSync(GEN5_PATHS.bw2Json, 'utf8')) as Bw2Numbers
  const refs = battleRefs(numbers)
  const { watch } = refs
  const plan = readPlan(options, refs)
  log(
    `route: ${String(plan.steps.length)} steps from ${options.from ?? 'boot'} to ${options.to ?? 'the end'}`,
  )
  const served = await serve(false)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  const refused: string[] = []
  try {
    const page = await (await browser.newContext({ viewport: RUN_VIEWPORT })).newPage()
    watchRequests(page, origin, false, refused)
    await page.goto(`${origin}/`)
    await page.evaluate((queued) => {
      ;(globalThis as unknown as Gen5Global).gen5.queueRun(queued)
    }, plan)
    await page.setInputFiles('#dump', dump)
    await waitForStart(page)
    if (options.uncapped) {
      await page.evaluate(() => {
        ;(globalThis as unknown as Gen5Global).gen5.uncapped(true)
      })
    }
    const report = await follow(page, options)
    await logEnd(page, options, watch)
    log(`${sampleLine()}; status: ${report.status}`)
  } finally {
    await browser.close()
    await served.close()
  }
  log(refused.length === 0 ? 'requests: all local' : `requests: ${String(refused.length)} refused`)
  return refused.length === 0 ? 0 : 1
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      label: { type: 'string', default: 's5' },
      uncapped: { type: 'boolean', default: false },
      minutes: { type: 'string', default: '18' },
    },
  })
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  log(`gen5-route: ${JSON.stringify(values)}; ${sampleLine()}`)
  process.exitCode = await run(dump, {
    from: values.from,
    to: values.to,
    label: values.label,
    uncapped: values.uncapped,
    deadlineMs: Date.now() + Number(values.minutes) * 60_000,
  })
}

if (import.meta.main) await main()
