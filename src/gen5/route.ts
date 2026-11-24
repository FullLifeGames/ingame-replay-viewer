// The Gen 5 spike's route from boot into Black 2's first battle (#72, plan 1.4 route (a)): the
// macro that src/web/gen5/frame-hook.ts plays one emulated frame at a time. Each mark is a
// milestone where a run saves a state and a frame, so the next attempt starts there
// (scripts/gen5-route.ts). Frame counts were read off frames of earlier runs, never off a clock.
import type { Button, MacroStep } from './macro.ts'
import type { RamCheck, RamRef } from './ram-check.ts'

/** Frames a scripted press holds its buttons: the game reads its pad once per frame. */
const PRESS_FRAMES = 4

const wait = (frames: number): MacroStep => ({ kind: 'wait', frames })
const press = (button: Button, frames = PRESS_FRAMES): MacroStep => ({
  kind: 'press',
  buttons: [button],
  frames,
})
const mark = (name: string): MacroStep => ({ kind: 'mark', name })

/** Presses A once every `every` frames for `frames` frames: text boxes, one after the other. */
const mashA = (frames: number, every: number): MacroStep => ({
  kind: 'mash',
  frames,
  mash: { buttons: ['A'], every, hold: PRESS_FRAMES },
})

/** The opening runs until Start skips it, at the frame S1 used (just after the logo). */
const TO_TITLE: MacroStep[] = [wait(1900), press('Start'), wait(600), mark('title')]

/** A press and a short gap, so the next press is a new one: a cursor moves once per press. */
const TAP_GAP = 8
const tap = (button: Button): MacroStep[] => [press(button), wait(TAP_GAP)]
const taps = (button: Button, count: number): MacroStep[] =>
  Array.from({ length: count }, () => tap(button)).flat()

/** `count` steps of `frames` frames, A every `every` frames, with a mark after each. */
const markedMash = (prefix: string, count: number, frames: number, every: number): MacroStep[] =>
  Array.from({ length: count }, (_, i) => [
    mashA(frames, every),
    mark(`${prefix}-${String(i + 1).padStart(2, '0')}`),
  ]).flat()

/** Title to "You're a boy, right?": Start opens the menu, A on NEW GAME, then A through
 * Professor Juniper's talk (explore-01 to explore-07 show it) to the YES of the boy question. */
const TO_GENDER: MacroStep[] = [
  press('A'),
  wait(300),
  mark('explore-00'),
  ...markedMash('explore', 8, 300, 45),
]

/** YES to "You're a boy, right?", B through "I'd like to know your name" (B deletes nothing on
 * an empty name), then IRV on the upper-case keyboard, whose cursor starts on A: rows of ten
 * letters, I in the first row, R in the second, V in the third. Start moves to OK. */
const NAME: MacroStep[] = [
  ...tap('A'),
  { kind: 'mash', frames: 400, mash: { buttons: ['B'], every: 45, hold: PRESS_FRAMES } },
  mark('name-entry'),
  ...taps('Right', 8),
  ...tap('A'),
  ...tap('Down'),
  ...tap('Left'),
  ...tap('A'),
  ...taps('Left', 6),
  ...tap('Down'),
  ...tap('A'),
  ...tap('Start'),
  ...tap('A'),
  mark('named'),
]

/** A through "Your name is IRV?" (YES) and Juniper's talk about the rival, up to his keyboard,
 * which stands with "Hugh" filled in by rival-14 (the A before it came too early to type). */
const TO_RIVAL: MacroStep[] = markedMash('rival', 14, 45, 45)

/** Keeps "Hugh": Start moves to OK, A takes it. */
const RIVAL: MacroStep[] = [...tap('Start'), ...tap('A'), mark('rival-named')]

/** A every 45 frames with a mark every 300: Juniper's last words, the title card over Unova
 * (field-08), Bianca's scene outside a house (field-14 to field-18), the player's house, and
 * the player standing in his room from field-21 on. */
const TO_ROOM: MacroStep[] = markedMash('field', 22, 300, 45)

/** Frames a walk takes for one tile. */
const TILE_FRAMES = 16

/** One move per entry, each followed by a mark named `walk-NN` from `first` on. */
const probe = (moves: readonly Button[], frames: number, first: number): MacroStep[] =>
  moves.flatMap((button, i) => [
    press(button, frames),
    mark(`walk-${String(first + i).padStart(2, '0')}`),
  ])

/** The player's grid position, as the field keeps it while the route stays in Aspertia City: a
 * heap block whose address repeats as long as the route from boot does. Found by comparing the
 * states of three marks a known walk apart (outside, walk-42, walk-43: x 47, 45, 43 on row 761,
 * the row of Hugh's greeting trigger in pokebw2's res/field/events/aspertia_city.json); the
 * triple after it is the tile the player is walking to. */
export const PLAYER_X: RamRef = { name: 'player x', address: 0x0223e4da, width: 2 }
export const PLAYER_Z: RamRef = { name: 'player z', address: 0x0223e4de, width: 2 }

/** Holds `button` until the check holds, for at most 600 frames: a walk that stops at a wall
 * fails at its step instead of drifting. */
const walkUntil = (name: string, button: Button, check: RamCheck): MacroStep => ({
  kind: 'until',
  name,
  checks: [check],
  holdFor: 1,
  limit: 600,
  mash: { buttons: [button], every: 1, hold: 1 },
})

/** A probe of the room: one move at a time with a mark after each. Down three times moved the
 * player about one tile; the Left presses stopped at the bed. */
const PROBE: MacroStep[] = [
  ...probe(
    ['Down', 'Down', 'Down', 'Left', 'Left', 'Left', 'Left', 'Left', 'Left', 'Left', 'Left'],
    TILE_FRAMES,
    1,
  ),
  ...probe(
    ['Down', 'Down', 'Left', 'Left', 'Left', 'Left', 'Left', 'Left', 'Down', 'Down'],
    32,
    12,
  ),
]

/** Mom stops the player in the hall (walk-17): A through her talk. */
const MOM: MacroStep[] = [...markedMash('mom', 8, 150, 45), ...markedMash('talk', 8, 200, 20)]

/** From the hall to the door mat. A press of 32 frames walks two tiles (the earlier one-tile
 * reading came from the first press only turning the player). Five Lefts overshot the mat to the
 * table by the left wall (walk-29), four Rights overshot it the other way (walk-35, the mat four
 * tiles left on the same row), then four tiles left and Down onto the mat and out. */
const TO_DOOR: MacroStep[] = [
  ...probe(['Left', 'Left', 'Left', 'Left', 'Left', 'Down', 'Down', 'Down'], 32, 22),
  ...probe(['Right', 'Right', 'Right', 'Right', 'Down', 'Down'], 32, 30),
  ...probe(['Left', 'Left', 'Left', 'Left', 'Down', 'Down'], TILE_FRAMES, 36),
]

/** Outside the house (walk-41 the fade, town-02 the player before his door, nothing happens for
 * 1200 frames). The fade ignores the pad: a walk that started at once came to nothing and its
 * Up took the player back in, so the route waits first. Then west along the street and north
 * toward the city's centre. */
const TOWN: MacroStep[] = [
  wait(240),
  mark('outside'),
  ...probe(['Left', 'Left', 'Up', 'Up', 'Up', 'Up', 'Up'], 32, 42),
  ...markedMash('town', 6, 150, 20),
]

/** A boy greets IRV two tiles up the street (walk-44), then Hugh and his sister come
 * (town-06): A through their talk. */
const HUGH: MacroStep[] = markedMash('hugh', 3, 300, 20)

/** By hugh-03 the talk is over and Hugh stands left of IRV (more A only talks to him again,
 * hugh-06). North up the street to a square (walk-52; the next Up already opened a house door),
 * then west and north up the street on the left (Hugh follows) to the stairs at its top
 * (walk-58). They lead to the Trainers' School, which Hugh says is closed (walk-64, north-06
 * the player turned back). West of the school is a wall of trees and a girl in the way (a probe
 * west and north stopped there), so the route goes one tile down, east and north to the
 * Pokémon Center (walk-73). There Hugh stops IRV (walk-81: he was just in the Pokémon Center)
 * and turns him back (east-04); then east and north past the Pokémon Center to (54, 729).
 * From there the route walks by the player's position: pokebw2's events for Aspertia City put
 * the lookout's triggers at x 36 to 38 on rows 714 to 720, one level up, and Bianca at (36, 709).
 * North to row 721 (a lamp post blocks the way west there), back to row 724, west to the foot of
 * the stairs at x 46 (walk-100 shows them), one row down onto them, west on the landing to x 38,
 * north up the stairs to row 719 (Hugh's "the outlook" talk), north to row 712, west to x 36,
 * north below Bianca, and A to talk to her. */
const NORTH: MacroStep[] = [
  ...probe(['Up', 'Up', 'Up', 'Up'], 32, 49),
  ...probe(['Left', 'Left', 'Up', 'Up', 'Up', 'Up'], 32, 53),
  ...probe(['Up', 'Up', 'Up', 'Up', 'Up', 'Up'], 32, 59),
  ...markedMash('north', 6, 150, 20),
  ...probe(['Down'], TILE_FRAMES, 65),
  ...probe(['Right', 'Right', 'Right', 'Right', 'Up', 'Up', 'Up', 'Up'], 32, 66),
  ...probe(['Right', 'Right', 'Right', 'Up', 'Up', 'Up', 'Up', 'Up'], 32, 74),
  ...markedMash('east', 4, 150, 20),
  ...probe(['Right', 'Right', 'Right', 'Up', 'Up', 'Up', 'Up', 'Up', 'Up'], 32, 82),
  ...markedMash('north-east', 4, 150, 20),
  walkUntil('lookout-row', 'Up', { ...PLAYER_Z, atMost: 721 }),
  mark('lookout-row'),
  walkUntil('plaza', 'Down', { ...PLAYER_Z, oneOf: [724] }),
  mark('plaza'),
  walkUntil('stairs-foot', 'Left', { ...PLAYER_X, oneOf: [46] }),
  mark('stairs-foot'),
  ...probe(['Down'], TILE_FRAMES, 91),
  walkUntil('landing', 'Left', { ...PLAYER_X, atMost: 38 }),
  mark('landing'),
  walkUntil('lookout-stairs', 'Up', { ...PLAYER_Z, atMost: 719 }),
  mark('lookout-stairs'),
  ...markedMash('lookout', 4, 150, 20),
  walkUntil('lookout-top', 'Up', { ...PLAYER_Z, atMost: 712 }),
  mark('lookout-top'),
  walkUntil('below-bianca', 'Left', { ...PLAYER_X, atMost: 36 }),
  walkUntil('below-bianca', 'Up', { ...PLAYER_Z, atMost: 710 }),
  press('Up', 8),
  mark('below-bianca'),
  ...markedMash('bianca', 12, 150, 20),
]

/** Bianca's talk (bianca-04, YES to her Pokédex request at bianca-08) ends in the box of three
 * Poké Balls on the touch screen (bianca-12). A takes the ball under the cursor, Tepig, and YES;
 * A also says YES to a nickname, and the keyboard opens during starter-14's fade (starter-15).
 * More A would type a nickname (an earlier run typed AAAAAA), so the route waits for the
 * keyboard and takes OK with the name left empty, then A again toward the battle. */
const STARTER: MacroStep[] = [
  ...markedMash('starter', 14, 60, 20),
  wait(60),
  ...tap('Start'),
  ...tap('A'),
  mark('nicknamed'),
  ...markedMash('to-battle', 16, 150, 20),
]

/** By to-battle-16 Bianca's part is over and more A only repeats her last words, a message that
 * B does not close (a run that mashed B stood there for 600 frames). So the route holds Down
 * with A every 20 frames: A closes her words, and once they close Down turns IRV away from her
 * and walks him south to row 714, where pokebw2's trigger brings Hugh, who asks for a battle.
 * Their talk needs A too (B mashed for 9000 frames left it standing). After it Bianca only
 * repeats her call for a battle; the battle starts from the trigger on row 716, so the route
 * holds Down with A again until IRV stands there. Then A until the battle
 * has its adapter, then no input until the action menu stands (src/gen5/battle-check.ts) for
 * 60 frames: an A there would pick Fight. */
const battle = (checks: readonly RamCheck[]): MacroStep[] => [
  {
    kind: 'until',
    name: 'hugh-trigger',
    checks: [{ ...PLAYER_Z, oneOf: [714] }],
    holdFor: 1,
    limit: 900,
    mash: { buttons: ['A'], every: 20, hold: PRESS_FRAMES, held: ['Down'] },
  },
  mark('hugh-trigger'),
  {
    kind: 'until',
    name: 'battle-trigger',
    checks: [{ ...PLAYER_Z, oneOf: [716] }],
    holdFor: 1,
    limit: 3000,
    mash: { buttons: ['A'], every: 20, hold: PRESS_FRAMES, held: ['Down'] },
  },
  mark('battle-trigger'),
  {
    kind: 'until',
    name: 'battle-start',
    checks: checks.filter((check) => check.mainRamPointer === true),
    holdFor: 1,
    limit: 9000,
    mash: { buttons: ['A'], every: 20, hold: PRESS_FRAMES },
  },
  mark('battle-start'),
  { kind: 'until', name: 'battle', checks, holdFor: 60, limit: 3000 },
  mark('battle'),
]

/** The route from boot; `battleChecks` is the end condition (src/gen5/battle-check.ts). */
export function newGameRoute(battleChecks: readonly RamCheck[]): MacroStep[] {
  return [
    ...TO_TITLE,
    ...TO_GENDER,
    ...NAME,
    ...TO_RIVAL,
    ...RIVAL,
    ...TO_ROOM,
    ...PROBE,
    ...MOM,
    ...TO_DOOR,
    ...TOWN,
    ...HUGH,
    ...NORTH,
    ...STARTER,
    ...battle(battleChecks),
  ]
}
