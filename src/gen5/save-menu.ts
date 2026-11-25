// The field menu's macros (#78): the save, and the text speed in Options. X opens the menu on the
// touch screen, the cursor goes to a button, and A takes it. For the save, A answers YES to "Would
// you like to save the game?", and B closes "<player> saved the game." once the write is over. The
// menu lists other buttons for each kind of menu (before the first Pokémon, before the Pokédex,
// with both), so the button's place is the caller's. A mark follows every press and every 30
// frames, so a run's frames show each moment and the write's end can be read off them.
import { type Button, mark, type MacroStep, press, PRESS_FRAMES, wait } from './macro.ts'
import { tap } from './route.ts'

/** A button of the field menu's grid: its row from the top, its column from the left. The cursor
 * starts on the top left button when X opens the menu. */
export interface MenuSlot {
  row: number
  column: number
}

/** Our reading of the town save's frames (78-1b): before the first Pokémon the menu shows Bag and
 * the player's card in the first row, Save and Options in the second. */
export const SAVE_SLOT_BEFORE_POKEMON: MenuSlot = { row: 1, column: 0 }

/** The menu once the player has Pokémon and a Pokédex (the Pokédex comes with the first Pokémon):
 * Pokémon and Pokédex in the first row, Bag and the player's card in the second, Save and Options
 * in the third. Our reading of 78-2b's frames. */
export const SAVE_SLOT_WITH_POKEDEX: MenuSlot = { row: 2, column: 0 }
export const OPTIONS_SLOT_WITH_POKEDEX: MenuSlot = { row: 2, column: 1 }

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

/** Frames from A on Options until the panel takes keys: the field fades out and the panel in. */
const PANEL_FRAMES = 180

/** Frames from A in the panel back to the field menu: the panel fades out and the field opens
 * again. B then closes the menu; a second B in the field does nothing. */
const BACK_FRAMES = 300

/** Presses of Right on the text speed: the panel steps one value per press and stops at fast,
 * and its first key may only bring the cursor back from the touch screen (config_panel.c). */
const TEXT_SPEED_STEPS = 4

/** The marks `<prefix>-01`, `<prefix>-02`, … in route order, and the steps that hand them out. */
function marker(prefix: string) {
  let count = 0
  const next = (): MacroStep => {
    count += 1
    return mark(`${prefix}-${String(count).padStart(2, '0')}`)
  }
  const marked = (button: Button) => [...tap(button), next()]
  const beat = (button?: Button) =>
    button === undefined ? [wait(BEAT)] : [press(button), wait(BEAT - PRESS_FRAMES)]
  const beats = (frames: number, button?: Button) =>
    Array.from({ length: Math.ceil(frames / BEAT) }, () => [...beat(button), next()]).flat()
  return { next, marked, beats }
}

type Marker = ReturnType<typeof marker>

/** From the field to A on the button at `slot`. Up first: the menu opens for the touch screen, so
 * the game takes the first key only to show the cursor, and Up on the top left button moves
 * nothing in any case. */
function choose(slot: MenuSlot, { next, marked, beats }: Marker): MacroStep[] {
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
  ]
}

/** The steps from the field to the mark `saved`, with the Save button at `slot`. */
export function saveGame(slot: MenuSlot): MacroStep[] {
  const marks = marker('save')
  return [
    ...choose(slot, marks),
    ...marks.beats(QUESTION_FRAMES),
    ...marks.marked('A'),
    ...marks.beats(WRITE_FRAMES, 'B'),
    mark('saved'),
  ]
}

/** The steps from the field to the mark `text-fast`, with the Options button at `slot`: Right on
 * the text speed, the first row of the panel, until it stands at fast, and A on it, which keeps
 * the changes. The battle effects keep their value. */
export function fastText(slot: MenuSlot): MacroStep[] {
  const marks = marker('options')
  const step = () => [...marks.marked('Right'), ...marks.beats(BEAT)]
  return [
    ...choose(slot, marks),
    ...marks.beats(PANEL_FRAMES),
    ...Array.from({ length: TEXT_SPEED_STEPS }, step).flat(),
    ...marks.marked('A'),
    ...marks.beats(BACK_FRAMES),
    ...marks.marked('B'),
    ...marks.beats(BEAT),
    ...marks.marked('B'),
    ...marks.beats(BEAT),
    mark('text-fast'),
  ]
}
