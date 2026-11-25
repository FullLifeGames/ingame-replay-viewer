// The macro from the rival battle's action menu on (#78): it plays Black 2 on from the spike's
// state s5-battle (src/gen5/route.ts) through the story towards a save before a trainer on
// Route 20. Each scene ends in a mark, and a scene we have not read yet carries a mark every BEAT
// frames, so a run's frames show its flow and the next run starts from the state of the last good
// mark (scripts/gen5-route.ts --route trainer --state <state>). After the battle B closes the
// text: it also closes a message, but it starts no talk with the person the player faces and
// answers NO to a question, so a beat too many does no harm. Frame counts are our readings of
// earlier runs' frames, and every position is our reading of RAM in a run.
import type { RoutePlaces } from './bw2-numbers.ts'
import { type Button, type MacroStep, routeSlice } from './macro.ts'
import type { RamCheck } from './ram-check.ts'
import { mark, PLAYER_X, PLAYER_Z, press, PRESS_FRAMES } from './route.ts'

/** Frames between two marks of a scene. */
const BEAT = 150

/** Frames from one press that closes text to the next. */
const TEXT_EVERY = 20

/** `count` beats of BEAT frames with `button` every TEXT_EVERY frames, and `held` on every frame,
 * each followed by a mark `<prefix>-NN`. */
function beats(prefix: string, count: number, button: Button, held?: readonly Button[]) {
  const mash = { buttons: [button], every: TEXT_EVERY, hold: PRESS_FRAMES }
  return Array.from({ length: count }, (_, i): MacroStep[] => [
    { kind: 'mash', frames: BEAT, mash: held === undefined ? mash : { ...mash, held } },
    mark(`${prefix}-${String(i + 1).padStart(2, '0')}`),
  ]).flat()
}

/** Holds `button` until the check holds, for at most 600 frames, then marks `name`: a walk that
 * stops at a wall fails at its step instead of drifting. */
const walkTo = (name: string, button: Button, check: RamCheck): MacroStep[] => [
  {
    kind: 'until',
    name,
    checks: [check],
    holdFor: 1,
    limit: 600,
    mash: { buttons: [button], every: 1, hold: 1 },
  },
  mark(name),
]

/** The battle with A every TEXT_EVERY frames: A picks Fight and the first move each turn and
 * closes the battle's text. The player stands on the battle's row from its start to its end (the
 * spike's marks read the same row before and in the battle), so the battle is over once he leaves
 * it. In 78-2a's first run Tepig won, Hugh and Bianca spoke, the player stepped one row off at
 * center-door, and the scene's fade set him down before the Pokémon Center by center-01. */
const battle = ({ battleTrigger }: RoutePlaces): MacroStep[] => [
  {
    kind: 'until',
    name: 'center-door',
    checks: [{ ...PLAYER_Z, noneOf: [battleTrigger.z] }],
    holdFor: 1,
    limit: 12_000,
    mash: { buttons: ['A'], every: TEXT_EVERY, hold: PRESS_FRAMES },
    markEvery: BEAT,
  },
  mark('center-door'),
]

/** Bianca's tour of the Pokémon Center: the heal, the PC, the Poké Mart and her Poké Balls, then
 * she leaves (center-20 in 78-2a's first run) and the player stands free inside. The position
 * refs read 0 in there. */
const CENTER: MacroStep[] = [...beats('center', 30, 'B'), mark('center-tour')]

/** Out of the Pokémon Center: down to the row above the door, one tile left onto the door's
 * column, and down through the door. */
const EXIT: MacroStep[] = [
  press('Down', 64),
  mark('exit-01'),
  press('Left', 24),
  mark('exit-02'),
  press('Down', 120),
  mark('center-exit'),
]

/** Outside, Mom and Hugh's sister meet the player: the Running Shoes and the Town Maps. Mom's
 * last words still printed at shoes-20 in the first run and wait for a key. */
const CITY: MacroStep[] = [...beats('shoes', 24, 'B'), mark('city-free')]

/** North to the gate of Route 19: east to the column the spike walked north on past the Pokémon
 * Center, and north on it to the row the spike's lookout walk stopped at (both read from RAM on
 * the spike's runs, src/gen5/route.ts). Then Up held with B every beat: on into the gate and its
 * guard's text and Potion (gate-03 to gate-06 in 78-2a's second run), which end with the player
 * free below the gate's north door at gate-08. The position refs read 0 in the gate. */
const GATE: MacroStep[] = [
  ...walkTo('gate-column', 'Right', { ...PLAYER_X, oneOf: [54] }),
  ...walkTo('gate-road', 'Up', { ...PLAYER_Z, atMost: 721 }),
  ...beats('gate', 8, 'B', ['Up']),
]

/** Up alone did not move the player at gate-08 (78-2a's third run: 1,200 frames against the
 * wall beside the north door), so two tiles west first, then Up held with B every beat through
 * the door into Route 19 and north into Bianca's call. */
const ROUTE_19: MacroStep[] = [
  press('Left', 32),
  mark('gate-door'),
  ...beats('route-19', 3, 'B', ['Up']),
  mark('route-19'),
]

/** Bianca shows how to catch a Pokémon: B through her talk and the battle she plays herself. */
const CAPTURE: MacroStep[] = [...beats('capture', 24, 'B'), mark('capture-over')]

/** East along Route 19, Right held with B every beat: Bianca's last words close (east-03 in
 * 78-2a's fourth run), the road runs east, and Alder meets the player (east-11 to east-16). The
 * position refs read 0 from the gate on, so the walks here go by frames. */
const EAST: MacroStep[] = beats('east', 16, 'B', ['Right'])

/** B through the rest of Alder's talk; he walks off east, and the player stands free on
 * Route 19. */
const ALDER: MacroStep[] = [...beats('alder', 8, 'B'), mark('alder-gone')]

/** East into Floccesy Town, Right held with B every beat: the town's card (floccesy-01), Alder's
 * "My house is just a little farther!" (floccesy-03, floccesy-04), and he walks off north. At
 * floccesy-06 the player stands on the road below the Pokémon Center; further east the road ends
 * at a fence (78-2a's fifth run). */
const FLOCCESY: MacroStep[] = beats('floccesy', 6, 'B', ['Right'])

/** To Alder's house: east one tile at a time with a mark after each (town-east-04 stands where
 * the road leaves north beside the Pokémon Center), then Up held with B every beat. The road leads
 * north up the stairs to Alder (house-03), who asks about the two Town Maps and sends the player
 * on to Route 20 (house-08); he walks off by house-09, and the held Up takes the player north to
 * an old man before a house (house-10 to house-12). B alone after it starts no talk with him
 * (errand-01 to errand-12): the player stands free there (78-2a's sixth run). */
const HOUSE: MacroStep[] = [
  ...[1, 2, 3, 4].flatMap((n) => [press('Right', 16), mark(`town-east-0${String(n)}`)]),
  ...beats('house', 12, 'B', ['Up']),
  ...beats('errand', 12, 'B'),
]

/** The route from the rival battle's action menu. */
const route = (places: RoutePlaces): MacroStep[] => [
  ...battle(places),
  ...CENTER,
  ...EXIT,
  ...CITY,
  ...GATE,
  ...ROUTE_19,
  ...CAPTURE,
  ...EAST,
  ...ALDER,
  ...FLOCCESY,
  ...HOUSE,
]

const markNames = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'mark' ? [step.name] : []))

/** The route from the state a run starts from: the steps after the state's mark when it is one of
 * the route's, else the whole route (from the spike's s5-battle). A run keeps a state at every
 * mark of its own and at none of the marks its waits hand out. */
export function trainerRoute(
  places: RoutePlaces,
  from?: string,
): { steps: MacroStep[]; stateMarks: string[] } {
  const all = route(places)
  const steps =
    from !== undefined && markNames(all).includes(from) ? routeSlice(all, from, undefined) : all
  return { steps, stateMarks: markNames(steps) }
}
