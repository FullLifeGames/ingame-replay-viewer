// The route runs of the Gen 5 spike (#72, #78): plays a route on the spike page in headless
// Chromium, from boot or from a state under build/gen5/states/: the new game of src/gen5/route.ts
// up to a mark or its end, the save from the field menu (src/gen5/save-menu.ts), the continue
// from a save (src/gen5/continue-route.ts), with or without a probe east after it, or the story
// on from the rival battle (src/gen5/trainer-route.ts). At each mark the page saves a state and
// the core's frame; scripts/gen5-route-run.ts writes them to build/gen5/states/ and
// build/gen5/frames/ (gitignored, ADR 0002; never served or committed) and logs the emulated
// frame, the wall time and a hash of main RAM. Requests stay on the machine and carry no body (scripts/gen5-requests.ts).
// Usage: GEN5_DUMP=<path> node scripts/gen5-route.ts with the options of
// scripts/gen5-route-options.ts.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { chromium, type Page } from '@playwright/test'

import { battleRefs } from '../src/gen5/battle-check.ts'
import type { Bw2Numbers, RoutePlaces } from '../src/gen5/bw2-numbers.ts'
import { continueRoute, probeEast } from '../src/gen5/continue-route.ts'
import type { Gen5Global, RunPlan } from '../src/gen5/hook.ts'
import { routeSlice } from '../src/gen5/macro.ts'
import { newGameRoute, PLAYER_X, PLAYER_Z } from '../src/gen5/route.ts'
import { SAVE_SLOT_BEFORE_POKEMON, saveGame } from '../src/gen5/save-menu.ts'
import { FIELD_X, FIELD_Z, trainerRoute } from '../src/gen5/trainer-route.ts'
import { log, logSave, sampleLine, waitForStart } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { readRouteOptions, type RouteOptions, stateBase } from './gen5-route-options.ts'
import { follow, logEnd, type StateMeta, takeStableSave } from './gen5-route-run.ts'
import { logStorage, type RequestLog, watchRequests } from './gen5-requests.ts'
import { CHROMIUM_ARGS, PAGE_HOST, RUN_VIEWPORT, serve } from './gen5-shot.ts'

type BattleRefs = ReturnType<typeof battleRefs>

type Route = Pick<RunPlan, 'steps' | 'stateMarks'>

/** The probe's beats after Continue: 40 of 30 frames, room for a few tiles' walk, the trainer's
 * walk-up and line, and the battle's opening. */
const PROBE_BEATS = 40

/** The steps of the chosen route; the save route keeps one state, at its mark `saved`, and the
 * trainer route plays on after `from`, the mark of the state it starts from. */
function routeOf(
  options: RouteOptions,
  refs: BattleRefs,
  places: RoutePlaces,
  from?: string,
): Route {
  if (options.route === 'save-here')
    return { steps: saveGame(SAVE_SLOT_BEFORE_POKEMON), stateMarks: ['saved'] }
  if (options.route === 'continue') return { steps: continueRoute() }
  if (options.route === 'continue-probe')
    return { steps: [...continueRoute(), ...probeEast(PROBE_BEATS)] }
  if (options.route === 'trainer') return trainerRoute(places, from)
  return { steps: routeSlice(newGameRoute(places, refs.checks), options.from, options.to) }
}

function readPlan(options: RouteOptions, refs: BattleRefs, places: RoutePlaces): RunPlan {
  const { watch } = refs
  const markRefs = [PLAYER_X, PLAYER_Z, FIELD_X, FIELD_Z]
  const base = stateBase(options)
  if (base === undefined)
    return { ...routeOf(options, refs, places), watch, markRefs, startFrame: 0 }
  const path = join(GEN5_PATHS.states, base)
  const meta = JSON.parse(readFileSync(`${path}.json`, 'utf8')) as StateMeta
  const state = readFileSync(`${path}.state`).toString('base64')
  log(
    `from state ${base}: mark ${meta.mark}, frame ${String(meta.frame)}, main RAM ${String(meta.ramSha)}`,
  )
  const route = routeOf(options, refs, places, meta.mark)
  return { ...route, watch, markRefs, state, stateSha: meta.ramSha, startFrame: meta.frame }
}

/** Queues the run, and the save of the build machine if the command names one, before the pick. */
async function queue(page: Page, plan: RunPlan, save: string | undefined): Promise<void> {
  await page.evaluate((queued) => {
    ;(globalThis as unknown as Gen5Global).gen5.queueRun(queued)
  }, plan)
  if (save === undefined) return
  const bytes = readFileSync(save)
  await page.evaluate((base64) => {
    ;(globalThis as unknown as Gen5Global).gen5.queueSave(base64)
  }, bytes.toString('base64'))
  log(`queued the save ${save}: ${String(bytes.length)} bytes`)
}

/** Plays the route in the opened page; true when the save, if asked for, was taken. */
async function play(page: Page, dump: string, plan: RunPlan, options: RouteOptions) {
  await queue(page, plan, options.save)
  await page.setInputFiles('#dump', dump)
  await waitForStart(page)
  await logSave(page, 'at the start')
  if (options.uncapped) {
    await page.evaluate(() => {
      ;(globalThis as unknown as Gen5Global).gen5.uncapped(true)
    })
  }
  const report = await follow(page, options)
  await logEnd(page, options, plan.watch)
  log(`${sampleLine()}; status: ${report.status}`)
  let taken = true
  if (options.takeSave !== undefined) {
    taken = report.status === 'done' && (await takeStableSave(page, options.takeSave))
    if (report.status !== 'done') log(`take-save: the run is ${report.status}, so no save`)
  }
  await logSave(page, 'at the end')
  return taken
}

async function run(dump: string, options: RouteOptions): Promise<number> {
  mkdirSync(GEN5_PATHS.frames, { recursive: true })
  mkdirSync(GEN5_PATHS.states, { recursive: true })
  const numbers = JSON.parse(readFileSync(GEN5_PATHS.bw2Json, 'utf8')) as Bw2Numbers
  const plan = readPlan(options, battleRefs(numbers), numbers.route)
  log(
    `route ${options.route}: ${String(plan.steps.length)} steps from ${stateBase(options) ?? 'boot'}`,
  )
  const served = await serve(false)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  let requests: RequestLog | undefined
  let clean: boolean
  try {
    const page = await (await browser.newContext({ viewport: RUN_VIEWPORT })).newPage()
    requests = watchRequests(page, origin, false)
    await page.goto(`${origin}/${options.query}`)
    clean = await play(page, dump, plan, options)
    clean = (await logStorage(page)) && clean
  } finally {
    await browser.close()
    await served.close()
    if (requests) log(requests.summary())
  }
  return requests.failed || !clean ? 1 : 0
}

async function main(): Promise<void> {
  const options = readRouteOptions(process.argv.slice(2), Date.now())
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  log(`gen5-route: ${JSON.stringify(options)}; ${sampleLine()}`)
  process.exitCode = await run(dump, options)
}

if (import.meta.main) await main()
