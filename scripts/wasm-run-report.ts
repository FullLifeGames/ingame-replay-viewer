// The streams of one wasm:run, one after the other, and their report (#66). A stream that fails (a
// trap, a hang, a refusal that was not expected, a scene that misses) fails only itself: the run
// plays every stream it was asked for, reports each one's END or its failure, and counts them.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RunReport, ShotPlan } from './rom-shot.ts'
import { sayRun } from './rom-shot.ts'

/** A trap of the module, after `frame` frames of the run. */
export class ModuleTrap extends Error {
  override name = 'ModuleTrap'
  readonly frame: number

  constructor(frame: number, cause: unknown) {
    super(`the module trapped after ${String(frame)} frames: ${String(cause)}`, { cause })
    this.frame = frame
  }
}

/** Why a stream has no status: the trap and the frames before it, or the run's own error. */
export interface StreamFailure {
  message: string
  frame?: number
}

/** A stream's report: the shot tool's, with END, or the failure that ended it before a status. */
export interface StreamReport extends Omit<RunReport, 'status'> {
  status?: RunReport['status']
  /** END: the first frame on which the interpreter reported `finished`. */
  end?: number | undefined
  failure?: StreamFailure
  /** --against-baseline found no frames of this stream in the baseline, so it compared none. */
  noBaseline?: true
}

/** Plays one stream and reports it; it throws when the stream ends without a status. */
export type PlayStream = (plan: ShotPlan) => Promise<StreamReport>

/** Wall-clock seconds since `start` (performance.now()), to a tenth. */
export function secondsSince(start: number): number {
  return Math.round((performance.now() - start) / 100) / 10
}

function failedStream(plan: ShotPlan, error: unknown, seconds: number): StreamReport {
  const message = error instanceof Error ? error.message : String(error)
  const failure =
    error instanceof ModuleTrap ? { message: String(error.cause), frame: error.frame } : { message }
  const { name, expect, missing } = plan
  return { name, expect, seconds, scenes: [], missing, problems: [message], failure }
}

/** Plays the streams in their order; a stream that throws is reported as failed, and the run goes on. */
export async function playStreams(
  plans: readonly ShotPlan[],
  play: PlayStream,
): Promise<StreamReport[]> {
  const reports: StreamReport[] = []
  for (const plan of plans) {
    const start = performance.now()
    try {
      reports.push(await play(plan))
    } catch (error) {
      reports.push(failedStream(plan, error, secondsSince(start)))
    }
  }
  return reports
}

type Say = (line: string) => void

function sayStream(report: StreamReport, say: Say): void {
  const { status } = report
  if (status === undefined) {
    say(`${report.name}: FAILED, ${report.problems.join('; ')}, ${String(report.seconds)} s`)
    return
  }
  sayRun({ ...report, status }, say)
  if (report.end !== undefined) say(`  END at frame ${String(report.end)}`)
  if (report.noBaseline) say('  no baseline: frames not compared')
}

/** The last line: streams passed, failed and without a baseline, by name. */
export function countLine(reports: readonly StreamReport[]): string {
  const failed = reports.filter((report) => report.problems.length > 0).map(({ name }) => name)
  const unbased = reports.filter((report) => report.noBaseline).map(({ name }) => name)
  const passed = reports.length - failed.length
  const parts = [`${String(passed)} of ${String(reports.length)} streams passed`]
  if (failed.length > 0) parts.push(`${String(failed.length)} failed (${failed.join(', ')})`)
  if (unbased.length > 0) {
    parts.push(`${String(unbased.length)} with no baseline (${unbased.join(', ')})`)
  }
  return parts.join(', ')
}

/** Says each stream, writes report.json into `dir`, ends on the count; returns the failed count. */
export function finishStreams(reports: readonly StreamReport[], dir: string, say: Say): number {
  for (const report of reports) sayStream(report, say)
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(reports, null, 2)}\n`)
  say(`${countLine(reports)}; frames and report.json in ${dir}`)
  return reports.filter((report) => report.problems.length > 0).length
}
