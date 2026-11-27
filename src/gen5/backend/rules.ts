// The Gen 5 backend's rule for each kind of battle script event (#107): a table that tsc holds
// complete, as Gen 3's HANDLERS (src/gen3/translate/index.ts), so a new kind in the battle script
// fails the build until it has a rule here, and an event of a kind outside the table fails by
// name. Each rule says what becomes of its event; the kinds that do not play yet name the issue
// that plays them (lane plan §4). Every event before the first turn that would play is the game's
// own: BtlServerFlow_StartBattle runs the leads' switch-in effects before the server holds (#109,
// lane plan D3).
import type { ScriptEvent } from '../../script/events.ts'
import { type Gen5Fallback, laterFallback, lineFallback } from './fallbacks.ts'

/** What becomes of an event. `park`: the park shows it (#106). `game`: the game shows it itself.
 * `boundary`: it parts the blocks. `play`: the writer plays it where its Pokémon stand in place
 * (moves.ts), a switch-in as its switch, drag or send-in (switches.ts), a faint as the server's
 * faint (faints.ts), and an effect by its module (effects.ts). `later`: issue `issue` plays it.
 * `line`: Black 2 has no line for it, and nothing shows. */
export type Outcome =
  | { readonly as: 'park' | 'game' | 'boundary' | 'play' }
  | { readonly as: 'later'; readonly issue: number }
  | { readonly as: 'line'; readonly detail: string }

/** The event of one kind, also where one event type carries two kinds (`sideStart | sideEnd`). */
export type EventOf<K extends ScriptEvent['kind']> = ScriptEvent extends infer E
  ? E extends { readonly kind: infer Kinds }
    ? K extends Kinds
      ? E
      : never
    : never
  : never

type Rule<K extends ScriptEvent['kind']> = (event: EventOf<K>) => Outcome

/** The issue that plays what does not play yet: a whole replay. */
export const LATER_ISSUES = { whole: 110 } as const

const PLAY = { as: 'play' } as const
const WHOLE = { as: 'later', issue: LATER_ISSUES.whole } as const

const park = (): Outcome => ({ as: 'park' })
const play = (): Outcome => PLAY
const whole = (): Outcome => WHOLE
const line = (detail: string): Outcome => ({ as: 'line', detail })

const RULES = {
  player: park,
  teamSize: park,
  battleStart: park,
  turn: () => ({ as: 'boundary' }),
  switchIn: play,
  faint: play,
  // Lane plan D14: the game keeps the disguise's Pokémon in place (party-state.ts).
  replace: () => line('Black 2 shows the disguise throughout'),
  message: (event) => line(`Black 2 has no line for "${event.text}"`),
  win: whole,
  tie: whole,
  move: play,
  prepare: whole,
  anim: whole,
  cant: play,
  miss: play,
  ohko: whole,
  noTarget: whole,
  immune: play,
  fail: play,
  block: play,
  damage: play,
  heal: play,
  setHp: whole,
  status: play,
  cureStatus: play,
  cureTeam: play,
  statChange: play,
  statLimit: play,
  statReset: play,
  negativeStatReset: play,
  crit: play,
  effectiveness: play,
  hitCount: whole,
  effectStart: play,
  effectEnd: play,
  effectActivate: play,
  transform: whole,
  formChange: whole,
  terastallize: whole,
  singleTurn: play,
  singleMove: play,
  copyBoost: play,
  // Lane plan D2: ServerControl_TurnCheckWeather puts no line for a weather's turn.
  weather: (event) =>
    event.phase === 'upkeep'
      ? line(`Black 2 shows nothing for a turn of ${event.weather.toLowerCase()}`)
      : PLAY,
  sideStart: play,
  sideEnd: play,
  fieldActivate: play,
  item: play,
  itemEnd: play,
  ability: play,
} satisfies { readonly [K in ScriptEvent['kind']]: Rule<K> }

/** The rule of `event`'s kind; throws by name for a kind with none. */
export function ruleOf(event: ScriptEvent): Rule<ScriptEvent['kind']> {
  const rules = RULES as unknown as Partial<Record<string, Rule<ScriptEvent['kind']>>>
  const rule = rules[event.kind]
  if (rule === undefined) {
    throw new Error(`no Gen 5 rule for the event kind ${event.kind} (line ${String(event.line)})`)
  }
  return rule
}

/** For each event, whether the first turn began before it: the switch-ins before it are the
 * leads, which the game sends out itself. */
export function afterLeads(events: readonly ScriptEvent[]): boolean[] {
  const first = events.findIndex((event) => event.kind === 'turn')
  return events.map((_, i) => first !== -1 && i > first)
}

/** What becomes of each event, by its rule; before the first turn the game plays it itself. */
export function outcomesOf(events: readonly ScriptEvent[]): Outcome[] {
  const after = afterLeads(events)
  return events.map((event, i) => {
    const outcome = ruleOf(event)(event)
    return outcome.as === 'play' && after[i] !== true ? { as: 'game' } : outcome
  })
}

/** A fallback for each event that does not play yet or whose line Black 2 lacks, in event order. */
export function ruleFallbacks(events: readonly ScriptEvent[]): Gen5Fallback[] {
  const outcomes = outcomesOf(events)
  return events.flatMap((event, i) => {
    const outcome = outcomes[i]
    if (outcome?.as === 'later') return [laterFallback(event, outcome.issue)]
    if (outcome?.as === 'line') return [lineFallback(event, outcome.detail)]
    return []
  })
}
