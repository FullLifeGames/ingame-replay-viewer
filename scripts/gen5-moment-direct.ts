// The session's plan up to the battle's action menu (#78, #97), as scripts/gen5-moment.ts plays it
// before the moment: the walk's one plan from gen5-moment-args.ts, or the direct entry's one plan
// from power-on through the takeover and the park to the action menu (src/gen5/direct-entry.ts).
// No mark saves a state. The park writes both parties and trainer names the script hands in (the
// hand team of gen5-moment-team.ts or a test replay's, gen5-moment-replay.ts) and the style of
// --battle, with a save loaded or with none, and hides the near box's HP numbers right after the
// mark battle-start unless --hp-numbers shown asks to show them (#137).
import type { GaugeNumbers } from '../src/gen5/bw2-gauge-numbers.ts'
import type { ActorPlace, EntryNumbers } from '../src/gen5/bw2-numbers.ts'
import { directEntry, type EntrySides } from '../src/gen5/direct-entry.ts'
import type { PartySides } from '../src/gen5/direct-party.ts'
import type { ParkNames } from '../src/gen5/direct-park.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { RamCheck, RamRef } from '../src/gen5/ram-check.ts'
import { SHOWN_LINE } from '../src/gen5/hp-numbers.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { firstRun, type MomentOptions, type StateFile } from './gen5-moment-args.ts'

/** What the plan is built from: the battle's checks and watch, the save's trainer for the walk,
 * the entry's and the gauge's numbers, readers of the routine's build and of a state file, each
 * read only when the plan needs it, and the sealed parties and names the direct entry writes
 * (none for the walk). */
export interface SessionInput {
  refs: { checks: readonly RamCheck[]; watch: RamRef[] }
  trainer: ActorPlace
  entry: EntryNumbers
  gauge: GaugeNumbers
  readRoutine: () => RoutineBuild
  readState: (base: string) => StateFile
  team: { parties: PartySides; names: ParkNames } | undefined
}

/** The session's plan, the log lines of any name cut, and the line of the HP numbers. */
export function sessionPlan(
  options: MomentOptions,
  input: SessionInput,
): { plan: RunPlan; notes: string[]; hpNumbers: string } {
  const { refs, trainer, entry } = input
  if (options.entry === 'walk') {
    const plan = firstRun(options.start, refs, trainer, input.readState)
    return { plan, notes: [], hpNumbers: SHOWN_LINE }
  }
  if (options.start.from !== 'boot') throw new Error('the direct entry starts from boot')
  const { team } = input
  if (team === undefined) throw new Error('the direct entry needs both parties')
  const sides: EntrySides = {
    names: team.names,
    parties: team.parties,
    style: options.battle,
    ...(options.hpNumbers === 'hidden' ? { hpNumbers: input.gauge } : {}),
  }
  const direct = directEntry(entry, input.readRoutine(), sides, refs.checks)
  const plan: RunPlan = {
    steps: direct.steps,
    startFrame: 0,
    watch: [...direct.watch, ...refs.watch],
    stateMarks: [],
  }
  return { plan, notes: direct.notes, hpNumbers: direct.hpNumbers }
}
