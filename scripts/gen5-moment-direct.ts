// The session's plan up to the battle's action menu (#78, #97), as scripts/gen5-moment.ts plays it
// before the moment: the walk's one plan from gen5-moment-args.ts, or the direct entry's one plan
// from power-on through the takeover and the park to the action menu (src/gen5/direct-entry.ts).
// No mark saves a state. The park writes both parties and trainer names the script hands in (the
// hand team of gen5-moment-team.ts or a test replay's, gen5-moment-replay.ts) and the style of
// --battle, with a save loaded or with none.
import type { ActorPlace, EntryNumbers } from '../src/gen5/bw2-numbers.ts'
import { directEntry } from '../src/gen5/direct-entry.ts'
import type { PartySides } from '../src/gen5/direct-party.ts'
import type { ParkNames, ParkSides } from '../src/gen5/direct-park.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { RamCheck, RamRef } from '../src/gen5/ram-check.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { firstRun, type MomentOptions, type StateFile } from './gen5-moment-args.ts'

/** What the plan is built from: the battle's checks and watch, the save's trainer for the walk,
 * the entry's numbers, readers of the routine's build and of a state file, each read only when
 * the plan needs it, and the sealed parties and names the direct entry writes (none for the
 * walk). */
export interface SessionInput {
  refs: { checks: readonly RamCheck[]; watch: RamRef[] }
  trainer: ActorPlace
  entry: EntryNumbers
  readRoutine: () => RoutineBuild
  readState: (base: string) => StateFile
  team: { parties: PartySides; names: ParkNames } | undefined
}

/** The session's plan, and the log lines of any name cut. */
export function sessionPlan(
  options: MomentOptions,
  input: SessionInput,
): { plan: RunPlan; notes: string[] } {
  const { refs, trainer, entry } = input
  if (options.entry === 'walk') {
    return { plan: firstRun(options.start, refs, trainer, input.readState), notes: [] }
  }
  if (options.start.from !== 'boot') throw new Error('the direct entry starts from boot')
  const { team } = input
  if (team === undefined) throw new Error('the direct entry needs both parties')
  const sides: ParkSides = { names: team.names, parties: team.parties, style: options.battle }
  const direct = directEntry(entry, input.readRoutine(), sides, refs.checks)
  const plan: RunPlan = {
    steps: direct.steps,
    startFrame: 0,
    watch: [...direct.watch, ...refs.watch],
    stateMarks: [],
  }
  return { plan, notes: direct.notes }
}
