// The steps that every Gen 5 route from boot shares (#72, #78, D19): the opening up to the title,
// and the battle's entry at the route's end. The new game's route (src/gen5/route.ts) and the
// continue route (src/gen5/continue-route.ts) both import them. The entry comes in two forms. The
// long route's: A until the battle has its adapter, then no input until the battle checks
// (src/gen5/battle-check.ts) hold. The short route's, through the opening: A goes on through the
// battle's opening, whose messages pass sooner on A, and stops on the first frame the checks hold.
// Both stop A there because an A in the action menu would pick FIGHT. The checks hold once the
// game asks the player for an action, and an until step reads them before it gives a frame's
// buttons, so neither form presses a button in the frame they first hold or after it. The adapter
// marks the action chosen only once the whole action is picked (btl_client.c), so the hold cannot
// see an A that opened the move list; the run's frames show the action menu untouched.
import { mark, type MacroStep, press, PRESS_FRAMES, wait } from './macro.ts'
import type { RamCheck } from './ram-check.ts'

/** The opening runs until Start skips it, at the frame S1 used (just after the logo). */
export const TO_TITLE: MacroStep[] = [wait(1900), press('Start'), wait(600), mark('title')]

/** Frames from one press of A to the next while the battle comes. */
const TEXT_EVERY = 20

/** Frames in a row the battle checks hold before the route calls the action menu standing. */
const STANDING_FRAMES = 60

/** The most frames the hold may take through the opening, from the first frame the checks hold:
 * STANDING_FRAMES and a few more. */
const STANDING_LIMIT = STANDING_FRAMES + 4

/** The frames each wait may take before the run fails. */
export interface EntryLimits {
  /** From the step's start to the battle's adapter. */
  start: number
  /** From the adapter to the end of STANDING_FRAMES frames of the battle checks; through the
   * opening, from the adapter to the first frame the checks hold. */
  battle: number
}

/** How a route presses A while the battle comes: marks on the way, and a quicker beat. */
export interface EntryPace {
  /** Marks `battle-start-NNN` every this many frames while the route waits for the adapter. */
  markEvery?: number
  /** A every this many frames, held for half of them, instead of every TEXT_EVERY frames. */
  every?: number
  /** A through the battle's opening as well, up to the first frame the checks hold (mark
   * `action`), instead of no input from the adapter on. */
  throughOpening?: boolean
}

type Mash = NonNullable<Extract<MacroStep, { kind: 'until' }>['mash']>

function mashOf(every: number | undefined): Mash {
  return every === undefined
    ? { buttons: ['A'], every: TEXT_EVERY, hold: PRESS_FRAMES }
    : { buttons: ['A'], every, hold: Math.max(1, Math.floor(every / 2)) }
}

/** The steps from the adapter on: no input until the checks stand, or A through the opening. */
function afterAdapter(
  checks: readonly RamCheck[],
  limit: number,
  mash: Mash | undefined,
): MacroStep[] {
  const standing = { kind: 'until', name: 'battle', checks, holdFor: STANDING_FRAMES } as const
  if (mash === undefined) return [{ ...standing, limit }, mark('battle')]
  return [
    { kind: 'until', name: 'action', checks, holdFor: 1, limit, mash },
    mark('action'),
    { ...standing, limit: STANDING_LIMIT },
    mark('battle'),
  ]
}

/** A until the adapter pointer leads into main RAM (mark `battle-start`), then no input until all
 * `checks` hold for STANDING_FRAMES frames in a row (mark `battle`). Through the opening, A goes on
 * until all `checks` hold once (mark `action`), and no input follows while they stand. */
export function battleEntry(
  checks: readonly RamCheck[],
  limits: EntryLimits,
  pace: EntryPace = {},
): MacroStep[] {
  const { markEvery, every, throughOpening } = pace
  const mash = mashOf(every)
  return [
    {
      kind: 'until',
      name: 'battle-start',
      checks: checks.filter((check) => check.mainRamPointer === true),
      holdFor: 1,
      limit: limits.start,
      mash,
      ...(markEvery === undefined ? {} : { markEvery }),
    },
    mark('battle-start'),
    ...afterAdapter(checks, limits.battle, throughOpening === true ? mash : undefined),
  ]
}
