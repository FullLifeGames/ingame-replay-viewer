// The direct battle start (#97) as one plan from power-on to the battle's action menu: the
// takeover's steps to the park (direct-takeover.ts), then the park's writes, the go and the
// battle's entry (direct-park.ts). The park's writes need nothing from the script, and their
// pointer chains resolve in the page, so no wall time sits between the park and the go: the page
// writes the park in the frame the routine reads parked, and two runs keep the same frames. Pure:
// the numbers come in from build/gen5/bw2.json and build/gen5/routine.json.
import type { EntryNumbers } from './bw2-numbers.ts'
import { park, type ParkNames } from './direct-park.ts'
import { takeover } from './direct-takeover.ts'
import type { MacroStep } from './macro.ts'
import type { RamCheck, RamRef } from './ram-check.ts'
import type { RoutineBuild } from './routine-order.ts'

/** The plan's steps, the log lines of any name it cut, and the values it logs. */
export interface DirectEntry {
  steps: MacroStep[]
  notes: string[]
  watch: RamRef[]
}

/** The one plan from power-on: the takeover and the park, then the park's writes, the go and
 * the battle's entry. Each watched value once, in the order the plan first reads it. */
export function directEntry(
  entry: EntryNumbers,
  routine: RoutineBuild,
  names: ParkNames,
  battleChecks: readonly RamCheck[],
): DirectEntry {
  const boot = takeover(entry, routine)
  const parked = park(entry, boot, names, battleChecks)
  const known = new Set(boot.watch.map((ref) => ref.name))
  const watch = [...boot.watch, ...parked.watch.filter((ref) => !known.has(ref.name))]
  return { steps: [...boot.steps, ...parked.steps], notes: parked.notes, watch }
}
