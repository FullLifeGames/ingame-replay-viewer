// The marks of a whole replay's run (#110, lane plan D11): each mark's name, emulated frame and
// hash of main RAM, as the run's marks file keeps them, and the comparison of two runs mark by
// mark. Two runs of the same replay agree on both at every mark; the pictures follow wall time
// (src/web/gen5/frame-hook.ts) and stay out of it. Pure: scripts/gen5-replay.ts reads and writes
// the files.
import type { MarkRecord } from '../src/gen5/hook.ts'

/** A mark of a run: its name, its frame and the SHA-256 of main RAM there, or none while the
 * page still hashes it. */
export interface RunMark {
  name: string
  frame: number
  hash: string | undefined
}

/** Differing marks named one by one; the rest are counted. */
const NAMED = 5

/** The marks of a run's report. */
export function marksOf(report: { readonly marks: readonly MarkRecord[] }): RunMark[] {
  return report.marks.map(({ name, frame, ramSha }) => ({ name, frame, hash: ramSha }))
}

/** The names of the marks whose hash is pending. */
export function pendingMarks(marks: readonly RunMark[]): string[] {
  return marks.filter((mark) => mark.hash === undefined).map((mark) => mark.name)
}

/** How a mark of this run differs from the other run's, or nothing. */
function difference(name: string, here?: RunMark, there?: RunMark): string | undefined {
  if (here === undefined) return `mark ${name}: missing in this run`
  if (there === undefined) return `mark ${name}: missing in the other run`
  if (here.frame !== there.frame) {
    return `mark ${name}: frame ${String(here.frame)} here, ${String(there.frame)} in the other run`
  }
  if (here.hash === undefined) return `mark ${name}: main RAM sha256 pending in this run`
  if (there.hash === undefined) return `mark ${name}: main RAM sha256 pending in the other run`
  if (here.hash === there.hash) return undefined
  return `mark ${name}: main RAM sha256 ${here.hash} here, ${there.hash} in the other run`
}

/** The marks by name; a name's second mark as `<name> (2)`, and so on. */
function byName(marks: readonly RunMark[]): Map<string, RunMark> {
  const seen = new Map<string, number>()
  return new Map(
    marks.map((mark) => {
      const count = (seen.get(mark.name) ?? 0) + 1
      seen.set(mark.name, count)
      return [count === 1 ? mark.name : `${mark.name} (${String(count)})`, mark]
    }),
  )
}

/** This run's marks against the other run's, by name in this run's order and then the other's
 * own: `equal` when every mark has both and agrees by frame and hash. The lines count the
 * differing marks and name the first NAMED of them. */
export function compareMarks(
  here: readonly RunMark[],
  there: readonly RunMark[],
): { equal: boolean; lines: string[] } {
  const ours = byName(here)
  const theirs = byName(there)
  const names = [...new Set([...ours.keys(), ...theirs.keys()])]
  const differs = names.flatMap((name) => difference(name, ours.get(name), theirs.get(name)) ?? [])
  if (differs.length === 0) {
    return {
      equal: true,
      lines: [`marks: all ${String(names.length)} agree by frame and main RAM sha256`],
    }
  }
  const more = differs.length > NAMED ? [`and ${String(differs.length - NAMED)} more`] : []
  return {
    equal: false,
    lines: [
      `marks: ${String(differs.length)} of ${String(names.length)} differ`,
      ...differs.slice(0, NAMED),
      ...more,
    ],
  }
}
