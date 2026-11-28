// The shot scene of the page's own replay (#111): scripts/gen5-shot.ts picks a test replay in the
// page's picker, takes the picker wide and at a phone's width, and hands over the dump; the page
// then plays the replay with no plan from outside. The scene ticks "Run without the speed cap" once
// the play begins, as scripts/gen5-replay.ts lifts the cap there, writes each mark's frame as it
// comes, and asks the page for a frame every EVERY frames while a block waits, so its marks
// compare with the run script's. At the end it logs every block with its lines, the battle's end,
// the page's end line and list, and the run's summary, built in Node from the numbers file the
// page fetched, and takes the last scene wide (the list beside the game) and at a phone's width.
// Exit 1 on a play that failed or did not end, a page row unequal to the Node replay's, a hash
// still pending or a mark that differs from the --against run's (lane plan D12).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'
import { runnerImport } from 'vite'

import type { Gen5Global, ReplayProgress, RunReport } from '../src/gen5/hook.ts'
import type * as NotShownPage from '../src/web/gen5/not-shown.ts'
import type * as NotShownWords from '../src/web/not-shown-list.ts'
import { type MomentTeam, readMomentOptions } from './gen5-moment-args.ts'
import { follow, hashed, logReport, marksChecked } from './gen5-moment-follow.ts'
import { markLines } from './gen5-moment-log.ts'
import type { ReplayTeam } from './gen5-moment-replay.ts'
import { readNumbers } from './gen5-moment-session.ts'
import { momentTeam } from './gen5-moment-team.ts'
import { log } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { EVERY } from './gen5-replay-args.ts'
import { marksFile } from './gen5-replay-exit.ts'
import { blockReport, endLines, runSummary } from './gen5-replay-log.ts'
import { PHONE_VIEWPORT, RUN_VIEWPORT } from './gen5-shot-browser.ts'

/** What the scene plays: the test replay, an earlier run's marks file, and when it gives up. */
export interface ReplayShot {
  team: Extract<MomentTeam, { from: 'replay' }>
  against: string | undefined
  deadlineMs: number
}

/** The shot's options that the scene reads. */
interface ShotValues {
  scene: string
  replay?: string | undefined
  against?: string | undefined
  minutes: string
  save?: string | undefined
}

/** The replay scene's options, by the moment script's rules for the id and the minutes; nothing
 * for another scene, which refuses them. */
export function replayShotOf(values: ShotValues, now: number): ReplayShot | undefined {
  const { scene, replay, against, minutes } = values
  if (scene !== 'replay') {
    if (replay === undefined && against === undefined) return undefined
    throw new Error('--replay and --against are for --scene replay alone.')
  }
  if (replay === undefined) throw new Error('--scene replay takes --replay <id>.')
  if (values.save !== undefined) {
    throw new Error(
      '--save is refused with --scene replay: the replay plays from power-on with no save.',
    )
  }
  const moment = readMomentOptions(['--replay', replay, '--minutes', minutes], now)
  if (moment.team.from !== 'replay') throw new Error('the moment script dropped the replay')
  return { team: moment.team, against, deadlineMs: moment.deadlineMs }
}

/** The page's address query: the threaded core, and a frame every EVERY frames for the replay. */
export function pageQuery({ threads, replay }: { threads: boolean; replay: boolean }): string {
  const query = new URLSearchParams()
  if (threads) query.set('threads', '1')
  if (replay) query.set('every', String(EVERY))
  const text = query.toString()
  return text === '' ? '' : `?${text}`
}

/** Differing rows named one by one; the rest are counted. */
const NAMED = 5

/** How the page's row `index` differs from the Node replay's, or nothing. */
function rowDifference(index: number, page?: string, node?: string): string | undefined {
  const row = `row ${String(index + 1)}`
  if (page === undefined) return `${row}: missing on the page, the Node replay's: ${String(node)}`
  if (node === undefined) return `${row}: ${page} on the page, none in the Node replay`
  return page === node ? undefined : `${row}: ${page} on the page, the Node replay's: ${node}`
}

/** The page's rows against the Node replay's, in order: `agree` when they are the same; the lines
 * to log count the rows and name the first NAMED that differ. */
export function rowsVerdict(
  page: readonly string[],
  node: readonly string[],
): { agree: boolean; lines: string[] } {
  const length = Math.max(page.length, node.length)
  const differs = Array.from({ length }, (_, index) =>
    rowDifference(index, page[index], node[index]),
  ).filter((line) => line !== undefined)
  if (differs.length === 0) {
    return { agree: true, lines: [`rows: all ${String(length)} agree with the Node replay's`] }
  }
  const counted =
    page.length === node.length
      ? `rows: ${String(differs.length)} of ${String(length)} differ`
      : `rows: ${String(page.length)} on the page, ${String(node.length)} in the Node replay's list`
  const more = differs.length > NAMED ? [`and ${String(differs.length - NAMED)} more`] : []
  return { agree: false, lines: [counted, ...differs.slice(0, NAMED), ...more] }
}

/** The scene's exit code: 0 only for a play that ended and whose rows and marks agree. */
export function shotExit(shot: {
  readonly phase: ReplayProgress['phase'] | undefined
  readonly status: RunReport['status']
  readonly rows: boolean
  readonly marks: boolean
}): 0 | 1 {
  return shot.phase === 'ended' && shot.status === 'done' && shot.rows && shot.marks ? 0 : 1
}

/** The page wide and at a phone's width, whole, then at the run's size again. */
async function pageShots(page: Page, name: string, wide: { width: number; height: number }) {
  const sizes = [
    ['wide', wide],
    ['phone', PHONE_VIEWPORT],
  ] as const
  for (const [size, viewport] of sizes) {
    await page.setViewportSize(viewport)
    const path = `${GEN5_PATHS.frames}/${name}-${size}.png`
    await page.screenshot({ path, fullPage: true })
    log(`frame ${path} (page at ${String(viewport.width)} px)`)
  }
  await page.setViewportSize(RUN_VIEWPORT)
}

/** Picks the test replay `id` before the dump, and takes the picker wide and on a phone. */
export async function chooseReplay(page: Page, id: string, label: string): Promise<void> {
  await page.selectOption('#replay', id)
  await pageShots(page, `${label}-picker`, { width: 1280, height: 900 })
}

const progressOf = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.replay())

/** The page's runs followed, each new mark's frame written, until the play ends or stops or the
 * deadline passes; the speed cap off once the play begins. */
async function followReplay(page: Page, label: string, deadlineMs: number): Promise<RunReport> {
  let written = 0
  let uncapped = false
  for (;;) {
    written = (await follow(page, label, 0, written)).marks.length
    const phase = (await progressOf(page))?.phase
    if (!uncapped && phase === 'play') {
      await page.check('#uncapped')
      uncapped = true
    }
    const over = phase === 'ended' || phase === 'failed' || Date.now() > deadlineMs
    if (over) return follow(page, label, 0, written)
  }
}

/** The page's end line, heading, counts and rows, logged; the rows as their texts. */
async function pageList(page: Page): Promise<string[]> {
  log(`page end line: ${String(await page.locator('#replay-end').textContent())}`)
  log(`page heading: ${String(await page.locator('#not-shown').textContent())}`)
  for (const count of await page.locator('#not-shown-counts li').allTextContents()) {
    log(`page count: ${count}`)
  }
  const rows = await page.locator('#not-shown-rows li').allTextContents()
  for (const row of rows) log(`page row: ${row}`)
  return rows
}

/** A module of the page, loaded through Vite's module runner, since it imports src/script/ as
 * the page's bundler does, without file extensions. */
async function pageModule<T>(...path: string[]): Promise<T> {
  const file = join(GEN5_PATHS.repo, ...path)
  return (await runnerImport<T>(file, { configFile: false, logLevel: 'silent' })).module
}

/** The rows the page's own modules give for the Node replay. */
async function nodeRows(team: ReplayTeam): Promise<string[]> {
  const list = await pageModule<typeof NotShownPage>('src', 'web', 'gen5', 'not-shown.ts')
  const words = await pageModule<typeof NotShownWords>('src', 'web', 'not-shown-list.ts')
  if (team.replay === undefined) throw new Error('the test replay gave no blocks')
  return list.notShownRows(team.replay, team.lines).map((row) => words.rowText(row))
}

/** Follows the page's replay to its end, logs it against the Node replay's, writes and compares
 * its marks, and takes the last scene; the exit code. */
export async function replayScene(page: Page, shot: ReplayShot, label: string): Promise<0 | 1> {
  const began = Date.now()
  const { against } = shot
  const earlier =
    against === undefined ? undefined : marksFile(readFileSync(against, 'utf8'), against)
  const team = await momentTeam(shot.team, readNumbers())
  const blocks = team.replay?.blocks ?? []
  const report = await hashed(page, await followReplay(page, label, shot.deadlineMs))
  logReport(report)
  for (const line of markLines(report.marks)) log(line)
  for (const line of blockReport(blocks, report.marks, team.lines)) log(line)
  if (team.end !== undefined) for (const line of endLines(team.end)) log(line)
  const rows = rowsVerdict(await pageList(page), await nodeRows(team))
  for (const line of rows.lines) log(line)
  const marks = marksChecked(label, report, earlier)
  log(runSummary(blocks, report.marks, Date.now() - began))
  await pageShots(page, `${label}-last-scene`, { width: 1280, height: 1000 })
  const phase = (await progressOf(page))?.phase
  log(`page replay: ${String(phase)}`)
  return shotExit({ phase, status: report.status, rows: rows.agree, marks })
}
