// The moment script's log lines for the build machine (#78, #97): each write of a plan with its
// fixed address and hops, and each mark of a run with its frame and the hash of main RAM there,
// so two runs compare mark by mark. Pure: scripts/gen5-moment.ts prints the lines.
import type { MarkRecord } from '../src/gen5/hook.ts'
import type { MacroStep } from '../src/gen5/macro.ts'
import type { MemoryWrite } from '../src/gen5/ram-write.ts'

const hex = (value: number) => `0x${value.toString(16)}`

/** One write: its field, its fixed address and what it writes. */
export function writeText(write: MemoryWrite): string {
  if (write.kind === 'copy') return `${write.field} copy of ${String(write.length)} bytes`
  const hops = write.hops ? ` hops ${write.hops.map(hex).join(' ')}` : ''
  const at = `${write.field} @${hex(write.address)}${hops}`
  if (write.kind === 'bits') return `${at} bits ${hex(write.mask)}=${String(write.value)}`
  return `${at} ${write.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`
}

/** A line per write of every write step. */
export function writeLines(steps: readonly MacroStep[]): string[] {
  return steps.flatMap((step) =>
    step.kind === 'write'
      ? step.writes.map((write) => `step write ${step.name}: ${writeText(write)}`)
      : [],
  )
}

/** A line per mark: its frame and the hash of main RAM at that frame, or pending. */
export function markLines(marks: readonly MarkRecord[]): string[] {
  return marks.map(
    (mark) =>
      `mark ${mark.name}: frame ${String(mark.frame)}, main RAM sha256 ${mark.ramSha ?? 'pending'}`,
  )
}
