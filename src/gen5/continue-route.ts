// The short route from boot with the save before Youngster Terrell (#78): the new game's opening
// up to the title, A on the title, the start menu with CONTINUE first and the save's player beside
// it, A on CONTINUE, and the wipe into Route 20 where the game was saved. A save made with the
// C-Gear off brings no question at CONTINUE. From CONTINUE on, Right is held and A pressed on a
// quick beat: A takes CONTINUE if the first press came too early and cuts short the season card
// that follows it (event_season_banner.c lets A skip its stay), and Right walks the player east
// as soon as the field lets him, into the trainer's sight. Then the battle's entry that every route
// shares (src/gen5/battle-entry.ts): A on the same beat through his line until the battle has its
// adapter, then no input until the action menu stands. Frame counts are our readings of earlier
// runs' frames, and the column is our reading of RAM in a run.
import { battleEntry, type EntryLimits, type EntryPace, TO_TITLE } from './battle-entry.ts'
import { mark, type MacroStep, press, wait } from './macro.ts'
import type { RamCheck } from './ram-check.ts'
import { FIELD_X } from './trainer-route.ts'

/** The most frames from the mark `title` to the first frame the battle checks hold (#78). The
 * route does not reach it yet: its best count is about 1,860 (78-4's runs), of which the
 * battle's opening takes 872 with no input. */
export const MENU_LIMIT = 1800

/** Frames from the end of A on the title to a standing start menu: our reading of 78-4's first
 * tuning run, whose marks every 10 frames showed the screen black 164 frames after the title's
 * mark and the menu lit 174 frames after it. If A comes before the menu takes it, the next step's
 * A does. */
const START_MENU_FRAMES = 170

/** Frames between two presses of A from CONTINUE to the battle, held for half of them: a new press
 * every few frames, and A held through most of the text, which prints it faster. */
const QUICK_A = 4

/** The column where the walk east from the save stops under the trainer's "!": our reading of
 * FIELD_X in 78-2b's probe of the save, two tiles east of the save's column. */
const SIGHT_COLUMN = 141

/** Frames from A on CONTINUE to the player in the trainer's sight: the start menu's blink and
 * fade, the save's place loading, the season card cut short, the field's fade and the walk. 78-4's
 * proving runs took 370; the rest is room. */
const FIELD_LIMIT = 400

/** Frames from the walk's end to the battle's adapter (the trainer's "!", his walk-up, his line
 * and the battle's wipe: 441 in 78-4's runs), and from there to the action menu
 * standing for 60 frames (872 and 59 more there). The rest is room. */
const ENTRY_LIMITS: EntryLimits = { start: 460, battle: 950 }

/** Marks every 30 frames while the trainer comes, so a run's frames show his "!" and line. */
const ENTRY_PACE: EntryPace = { markEvery: 30, every: QUICK_A }

/** The steps from boot to the action menu of the trainer's battle; `battleChecks` is the end
 * condition (src/gen5/battle-check.ts). */
export function continueRoute(battleChecks: readonly RamCheck[]): MacroStep[] {
  return [
    ...TO_TITLE,
    press('A'),
    wait(START_MENU_FRAMES),
    mark('continue'),
    press('A'),
    {
      kind: 'until',
      name: 'field',
      checks: [{ ...FIELD_X, oneOf: [SIGHT_COLUMN] }],
      holdFor: 1,
      limit: FIELD_LIMIT,
      mash: { buttons: ['A'], every: QUICK_A, hold: QUICK_A / 2, held: ['Right'] },
    },
    mark('field'),
    ...battleEntry(battleChecks, ENTRY_LIMITS, ENTRY_PACE),
  ]
}
