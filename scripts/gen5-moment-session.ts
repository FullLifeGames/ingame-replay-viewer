// The glue that the Gen 5 run scripts share (#110): the page frame around a run (the served page,
// headless Chromium, the request watch, the save and the storage at the end), a session's first
// run from boot, and the values a run watches once the battle is read. scripts/gen5-moment.ts
// and scripts/gen5-replay.ts call them.
import { readFileSync } from 'node:fs'

import { chromium, type Page } from '@playwright/test'

import { battleRefs } from '../src/gen5/battle-check.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { RamRef } from '../src/gen5/ram-check.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { listedReader } from './gen5-bw2-source.ts'
import { follow, hook } from './gen5-moment-follow.ts'
import type { Battle } from './gen5-moment-read.ts'
import { TEXT_BANKS } from './gen5-moment-scene.ts'
import { log, logSave, sampleLine, waitForStart } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { logStorage, type RequestLog, watchRequests } from './gen5-requests.ts'
import { CHROMIUM_ARGS, PAGE_HOST, RUN_VIEWPORT, serve } from './gen5-shot.ts'

/** The numbers scripts/gen5-bw2.ts generated from the pinned pokebw2 checkout. */
export const readNumbers = () => JSON.parse(readFileSync(GEN5_PATHS.bw2Json, 'utf8')) as Bw2Numbers

/** The direct entry's routine as scripts/gen5-routine.ts built it. */
export const readRoutine = () =>
  JSON.parse(readFileSync(GEN5_PATHS.routineJson, 'utf8')) as RoutineBuild

const readPokebw2 = listedReader(GEN5_PATHS.pokebw2)

/** The text banks a block's lines show, read from the pinned checkout. */
export const textBanks = (): Record<keyof typeof TEXT_BANKS, string> => ({
  move: readPokebw2(TEXT_BANKS.move),
  standard: readPokebw2(TEXT_BANKS.standard),
  set: readPokebw2(TEXT_BANKS.set),
})

/** The battle's watch, the server's proc and sequence, and both front Pokémon's HP. */
export function watchOf(numbers: Bw2Numbers, battle: Battle): RamRef[] {
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

/** Picks the dump and waits until the game is up, the save logged. */
export async function pickDump(page: Page, dump: string): Promise<void> {
  await page.setInputFiles('#dump', dump)
  await waitForStart(page)
  await logSave(page, 'at the start')
}

/** Where a run's frames go and when it gives up. */
export interface RunUntil {
  label: string
  deadlineMs: number
}

/** A session's first run from boot: queued before the pick, so it counts from the first frame,
 * then followed until it ends. */
export async function bootRun(page: Page, dump: string, plan: RunPlan, until: RunUntil) {
  await hook(page).queueRun(plan)
  await pickDump(page, dump)
  return follow(page, until.label, until.deadlineMs)
}

/** The page frame of a run: serves the page, opens it in headless Chromium at `query`, and runs
 * `run`, whose answer is the exit code; then logs the save and the storage, closes, and logs the
 * load and the requests. A request the page must not make or storage left behind sets exit 1. */
export async function withGen5Page(query: string, run: (page: Page) => Promise<number>) {
  const served = await serve(false)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  let requests: RequestLog | undefined
  try {
    const page = await (await browser.newContext({ viewport: RUN_VIEWPORT })).newPage()
    requests = watchRequests(page, origin, false)
    await page.goto(`${origin}/${query}`)
    process.exitCode = await run(page)
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
