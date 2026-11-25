// The steps that every Gen 5 route from boot shares (#72, #78, D19): the opening up to the title,
// and the battle's entry at the route's end. The new game's route (src/gen5/route.ts) and the
// continue route (src/gen5/continue-route.ts) both import them, so a run from either reaches the
// action menu by one rule: A until the battle has its adapter, then no input until the battle
// checks (src/gen5/battle-check.ts) hold, because an A in the action menu would pick FIGHT.
import { mark, type MacroStep, press, PRESS_FRAMES, wait } from './macro.ts'
import type { RamCheck } from './ram-check.ts'

/** The opening runs until Start skips it, at the frame S1 used (just after the logo). */
export const TO_TITLE: MacroStep[] = [wait(1900), press('Start'), wait(600), mark('title')]

/** Frames from one press of A to the next while the battle comes. */
const TEXT_EVERY = 20

/** Frames in a row the battle checks hold before the route calls the action menu standing. */
const STANDING_FRAMES = 60

/** The frames each wait may take before the run fails. */
export interface EntryLimits {
  /** From the step's start to the battle's adapter. */
  start: number
  /** From the adapter to the end of STANDING_FRAMES frames of the battle checks. */
  battle: number
}

/** A every TEXT_EVERY frames until the adapter pointer leads into main RAM (mark `battle-start`),
 * then no input until all `checks` hold for STANDING_FRAMES frames in a row (mark `battle`). */
export function battleEntry(checks: readonly RamCheck[], limits: EntryLimits): MacroStep[] {
  return [
    {
      kind: 'until',
      name: 'battle-start',
      checks: checks.filter((check) => check.mainRamPointer === true),
      holdFor: 1,
      limit: limits.start,
      mash: { buttons: ['A'], every: TEXT_EVERY, hold: PRESS_FRAMES },
    },
    mark('battle-start'),
    { kind: 'until', name: 'battle', checks, holdFor: STANDING_FRAMES, limit: limits.battle },
    mark('battle'),
  ]
}
