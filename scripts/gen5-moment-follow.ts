// The moment script's view of the page (#72, #97, #107): the page's hook, and the run's report
// followed until it ends, each new mark's frame and state written under build/gen5/frames/ and
// build/gen5/states/ (gitignored, ADR 0002), and the report logged. A whole replay's run waits for
// its marks' hashes and writes its marks file to build/gen5/runs/ (#110), as scripts/gen5-replay.ts
// and the shot scene of the page's own replay (gen5-shot-replay.ts, #111) do.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import type { Gen5Global, MarkRecord, RunPlan, RunReport } from '../src/gen5/hook.ts'
import { log } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { HASH_POLLS, marksVerdict } from './gen5-replay-exit.ts'
import { marksOf, pendingMarks, type RunMark } from './gen5-replay-marks.ts'

export const POLL_MS = 1000

/** The page's hook; spelled out in each evaluate, since those run in the page, not here. */
export const hook = (page: Page) => ({
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
export async function follow(page: Page, label: string, deadline: number, known = 0) {
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

export function logReport(report: RunReport): void {
  log(
    `run ${report.status} at frame ${String(report.frame)}, step ${String(report.step)}; jumps ${String(report.jumps)}`,
  )
  if (report.failed !== undefined) log(`failed: ${report.failed}`)
  if (report.loadCheck !== undefined) log(`load check: ${report.loadCheck}`)
  for (const line of report.watch) log(`watch ${line}`)
}

/** The page's report again each POLL_MS while a mark's hash is pending, HASH_POLLS times at
 * most. */
export async function hashed(page: Page, report: RunReport): Promise<RunReport> {
  let current = report
  for (let poll = 0; poll < HASH_POLLS && pendingMarks(marksOf(current)).length > 0; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    current = await hook(page).runReport()
  }
  return current
}

/** Writes the run's marks file as build/gen5/runs/<label>.json and compares it with an earlier
 * run's marks, the lines logged; false on a hash still pending or a mark that differs. */
export function marksChecked(
  label: string,
  report: RunReport,
  against: readonly RunMark[] | undefined,
): boolean {
  const marks = marksOf(report)
  mkdirSync(GEN5_PATHS.runs, { recursive: true })
  const file = { label, status: report.status, marks }
  writeFileSync(join(GEN5_PATHS.runs, `${label}.json`), `${JSON.stringify(file, null, 1)}\n`)
  log(`marks: ${String(marks.length)} written to build/gen5/runs/${label}.json`)
  const { agree, lines } = marksVerdict(marks, against)
  for (const line of lines) log(line)
  return agree
}
