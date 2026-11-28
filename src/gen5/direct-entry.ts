// The direct battle start (#97) as one plan from power-on to the battle's action menu: the
// takeover's steps to the park (direct-takeover.ts), then the park's writes, the go and the
// battle's entry (direct-park.ts). The script hands in the park's values before the run, and their
// pointer chains resolve in the page, so no wall time sits between the park and the go: the page
// writes the park in the frame the routine reads parked, and two runs keep the same frames. Pure:
// the numbers come in from build/gen5/bw2.json and build/gen5/routine.json.
import type { GaugeNumbers } from './bw2-gauge-numbers.ts'
import type { EntryNumbers } from './bw2-numbers.ts'
import { park, type ParkSides } from './direct-park.ts'
import { takeover } from './direct-takeover.ts'
import { afterBattleStart, type HpNumbersSteps, numbersSteps, SHOWN_LINE } from './hp-numbers.ts'
import type { MacroStep } from './macro.ts'
import type { RamCheck, RamRef } from './ram-check.ts'
import type { RoutineBuild } from './routine-order.ts'

/** The plan's steps, the log lines of any name it cut, the values it logs, and the log line of
 * what the near box shows of its HP (hp-numbers.ts). */
export interface DirectEntry {
  steps: MacroStep[]
  notes: string[]
  watch: RamRef[]
  hpNumbers: string
}

/** What the park writes, and the gauge's numbers when the near box's HP numbers are to hide. */
export interface EntrySides extends ParkSides {
  hpNumbers?: GaugeNumbers
}

/** The plan with the hide of the HP numbers after the mark battle-start, when asked for. */
function withNumbers(plan: MacroStep[], sides: EntrySides): HpNumbersSteps {
  const gauge = sides.hpNumbers
  if (gauge === undefined) return { steps: plan, line: SHOWN_LINE }
  return afterBattleStart(plan, (mash) => numbersSteps(gauge, sides.style, mash))
}

/** The one plan from power-on: the takeover and the park, then the park's writes, the go and
 * the battle's entry, with the hide of the near HP numbers right after the mark battle-start
 * when `sides` gives the gauge. Each watched value once, in the order the plan first reads it. */
export function directEntry(
  entry: EntryNumbers,
  routine: RoutineBuild,
  sides: EntrySides,
  battleChecks: readonly RamCheck[],
): DirectEntry {
  const boot = takeover(entry, routine)
  const parked = park(entry, boot, sides, battleChecks)
  const known = new Set(boot.watch.map((ref) => ref.name))
  const watch = [...boot.watch, ...parked.watch.filter((ref) => !known.has(ref.name))]
  const numbers = withNumbers([...boot.steps, ...parked.steps], sides)
  return { steps: numbers.steps, notes: parked.notes, watch, hpNumbers: numbers.line }
}
