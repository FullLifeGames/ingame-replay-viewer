// The session's plans up to the battle's action menu (#78, #97), as scripts/gen5-moment.ts plays
// them in turn before the moment: the walk's one plan from gen5-moment-args.ts, or the direct
// entry's two (D8). Plan 1 runs from power-on to the park (src/gen5/direct-takeover.ts); plan 2
// writes both sides at the park, sets the go and plays the battle's entry to the action menu
// (src/gen5/direct-park.ts). The routine waits at the park between the two, so the page may queue
// plan 2 whenever plan 1 has ended. No mark saves a state.
import type { ActorPlace, EntryNumbers } from '../src/gen5/bw2-numbers.ts'
import { park } from '../src/gen5/direct-park.ts'
import { takeover } from '../src/gen5/direct-takeover.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { RamCheck, RamRef } from '../src/gen5/ram-check.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { firstRun, type MomentOptions, type StateFile } from './gen5-moment-args.ts'

/** What the plans are built from: the battle's checks and watch, the save's trainer for the
 * walk, the entry's numbers, and readers of the routine's build and of a state file, each read
 * only when its plan needs it. */
export interface SessionInput {
  refs: { checks: readonly RamCheck[]; watch: RamRef[] }
  trainer: ActorPlace
  entry: EntryNumbers
  readRoutine: () => RoutineBuild
  readState: (base: string) => StateFile
}

/** The plans in the order the session plays them, and the log lines of any name cut. */
export function sessionPlans(
  options: MomentOptions,
  input: SessionInput,
): { plans: RunPlan[]; notes: string[] } {
  const { refs, trainer, entry } = input
  if (options.entry === 'walk') {
    return { plans: [firstRun(options.start, refs, trainer, input.readState)], notes: [] }
  }
  const boot = takeover(entry, input.readRoutine())
  const parked = park(entry, boot.layout, options.names, refs.checks)
  const plan = (steps: RunPlan['steps'], watch: RamRef[]): RunPlan => ({
    steps,
    startFrame: 0,
    watch,
    stateMarks: [],
  })
  return {
    plans: [plan(boot.steps, boot.watch), plan(parked.steps, [...parked.watch, ...refs.watch])],
    notes: parked.notes,
  }
}
