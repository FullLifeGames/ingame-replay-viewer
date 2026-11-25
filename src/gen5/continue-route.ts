// The short route from boot with a save (#78): the new game's opening up to the title, A on the
// title, the start menu with CONTINUE first and the save's player beside it, A on CONTINUE, and
// the wipe into the field where the game was saved. A save made with the C-Gear off brings no
// question at CONTINUE. The walk to the trainer and the battle's entry come with 78-4.
import type { MacroStep } from './macro.ts'
import { mark, press, TO_TITLE, wait } from './route.ts'

/** Frames from A on the title to a standing start menu: the new game's route marks its start menu
 * after the same wait (explore-00). */
const START_MENU_FRAMES = 300

/** Frames from A on CONTINUE through the wipe and the field's fade (our estimate; the run's
 * frame at the mark `field` checks it). */
const FIELD_FRAMES = 600

/** The steps from boot to the field of the save the page loaded. */
export function continueRoute(): MacroStep[] {
  return [
    ...TO_TITLE,
    press('A'),
    wait(START_MENU_FRAMES),
    mark('continue'),
    press('A'),
    wait(FIELD_FRAMES),
    mark('field'),
  ]
}
