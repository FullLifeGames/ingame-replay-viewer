// The session's plan up to the battle's action menu (#78, #97), as scripts/gen5-moment.ts plays it
// before the moment: the walk's one plan from gen5-moment-args.ts, or the direct entry's one plan
// from power-on through the takeover and the park to the action menu (src/gen5/direct-entry.ts).
// No mark saves a state. Until the script writes a team of its own (plan E-6, step E-6d), the park
// writes the save's first Pokémon for both sides of a single (gen5-save-party.ts).
import type { ActorPlace, EntryNumbers } from '../src/gen5/bw2-numbers.ts'
import { directEntry } from '../src/gen5/direct-entry.ts'
import type { PartySides } from '../src/gen5/direct-party.ts'
import type { ParkSides } from '../src/gen5/direct-park.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { RamCheck, RamRef } from '../src/gen5/ram-check.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { firstRun, type MomentOptions, type StateFile } from './gen5-moment-args.ts'

/** What the plan is built from: the battle's checks and watch, the save's trainer for the walk,
 * the entry's numbers, and readers of the routine's build, of a state file and of the parties a
 * save gives, each read only when the plan needs it. */
export interface SessionInput {
  refs: { checks: readonly RamCheck[]; watch: RamRef[] }
  trainer: ActorPlace
  entry: EntryNumbers
  readRoutine: () => RoutineBuild
  readState: (base: string) => StateFile
  readParties: (save: string) => PartySides
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
  const { start } = options
  if (start.from !== 'boot') throw new Error('the direct entry starts from boot with a save')
  const sides: ParkSides = {
    names: options.names,
    parties: input.readParties(start.save),
    style: 'single',
  }
  const direct = directEntry(entry, input.readRoutine(), sides, refs.checks)
  const plan: RunPlan = {
    steps: direct.steps,
    startFrame: 0,
    watch: [...direct.watch, ...refs.watch],
    stateMarks: [],
  }
  return { plan, notes: direct.notes }
}
