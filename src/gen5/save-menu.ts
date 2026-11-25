// The macro that saves Black 2 from the field (#78): X opens the menu on the touch screen, the
// cursor goes to the Save button, A takes it, A answers YES to "Would you like to save the game?",
// and B closes "<player> saved the game." once the write is over. The menu lists other buttons
// for each kind of menu (before the first Pokémon, before the Pokédex, with both), so the Save
// button's place is the caller's. A mark follows every press and every 30 frames, so a run's
// frames show each moment and the write's end can be read off them.
import type { Button, MacroStep } from './macro.ts'
import { mark, press, PRESS_FRAMES, tap, wait } from './route.ts'

/** A button of the field menu's grid: its row from the top, its column from the left. The cursor
 * starts on the top left button when X opens the menu. */
export interface MenuSlot {
  row: number
  column: number
}

/** Our reading of the town save's frames (78-1b): before the first Pokémon the menu shows Bag and
 * the player's card in the first row, Save and Options in the second. */
export const SAVE_SLOT_BEFORE_POKEMON: MenuSlot = { row: 1, column: 0 }

/** Frames between two marks. */
const BEAT = 30

/** Frames the menu takes to slide in after X. */
const MENU_FRAMES = 60

/** Frames from A on Save to the YES and NO of the question, at the default text speed. In 78-1b's
 * second run the question still printed 90 frames after A, so the next A only ended its text and
 * the first B answered NO. Our reading of its frames, with room to spare. */
const QUESTION_FRAMES = 240

/** Frames before X: the first run pressed X right after loading its state, and the menu stayed
 * shut while the next Down walked the player (78-1b's frames). */
const SETTLE_FRAMES = 60

/** Frames X is held: twice a tap's, our choice after that run. */
const X_FRAMES = 8

/** Frames given to the write after YES, B pressed at each beat: B does nothing while the game
 * writes and closes the "saved the game" message once it shows. In the third run of 78-1b the
 * message showed about 600 frames after YES; our reading, with room to spare. */
export const WRITE_FRAMES = 900

/** Hands out the marks save-01, save-02, … in route order. */
function counter(): () => MacroStep {
  let count = 0
  return () => {
    count += 1
    return mark(`save-${String(count).padStart(2, '0')}`)
  }
}

/** The steps from the field to the mark `saved`, with the Save button at `slot`. */
export function saveGame(slot: MenuSlot): MacroStep[] {
  const next = counter()
  const marked = (button: Button) => [...tap(button), next()]
  const beat = (button?: Button) =>
    button === undefined ? [wait(BEAT)] : [press(button), wait(BEAT - PRESS_FRAMES)]
  const beats = (frames: number, button?: Button) =>
    Array.from({ length: Math.ceil(frames / BEAT) }, () => [...beat(button), next()]).flat()
  // Up first: the menu opens for the touch screen, so the game takes the first key only to show
  // the cursor, and Up on the top left button moves nothing in any case.
  const moves: Button[] = [
    'Up',
    ...Array.from({ length: slot.row }, (): Button => 'Down'),
    ...Array.from({ length: slot.column }, (): Button => 'Right'),
  ]
  return [
    ...beats(SETTLE_FRAMES),
    press('X', X_FRAMES),
    next(),
    ...beats(MENU_FRAMES),
    ...moves.flatMap(marked),
    ...marked('A'),
    ...beats(QUESTION_FRAMES),
    ...marked('A'),
    ...beats(WRITE_FRAMES, 'B'),
    mark('saved'),
  ]
}
