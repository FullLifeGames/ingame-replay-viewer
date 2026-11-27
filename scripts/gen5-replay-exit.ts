// The run script's verdict (#110): an earlier run's marks file, read or refused; the marks of this
// run against a hash still pending and against the earlier run's; and the exit code, 0 only for a
// finished run whose parties and marks agree. Pure: scripts/gen5-replay.ts reads and writes the
// files and logs the lines.
import type { RunReport } from '../src/gen5/hook.ts'
import { compareMarks, pendingMarks, type RunMark } from './gen5-replay-marks.ts'

/** Polls of the page's report after the run while a mark's hash is pending. */
export const HASH_POLLS = 10

/** The marks of an earlier run's file; refused by its path when it holds none. */
export function marksFile(text: string, path: string): RunMark[] {
  const file = JSON.parse(text) as { marks?: RunMark[] }
  if (!Array.isArray(file.marks)) throw new Error(`${path} holds no marks of a run`)
  return file.marks
}

/** This run's marks: `agree` when no hash is pending and, with an earlier run's marks, every
 * mark agrees with them by frame and hash; the lines to log. */
export function marksVerdict(
  marks: readonly RunMark[],
  against: readonly RunMark[] | undefined,
): { agree: boolean; lines: string[] } {
  const pending = pendingMarks(marks)
  const lines =
    pending.length > 0
      ? [`marks: main RAM sha256 pending after ${String(HASH_POLLS)} polls: ${pending.join(', ')}`]
      : []
  if (against === undefined) return { agree: pending.length === 0, lines }
  const { equal, lines: compared } = compareMarks(marks, against)
  return { agree: pending.length === 0 && equal, lines: [...lines, ...compared] }
}

/** The run's exit code: 0 for a finished run whose parties and marks agree, 1 otherwise. */
export function runExit(run: {
  readonly status: RunReport['status']
  readonly party: boolean
  readonly marks: boolean
}): 0 | 1 {
  return run.status === 'done' && run.party && run.marks ? 0 : 1
}
