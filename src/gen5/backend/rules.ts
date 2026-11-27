// The Gen 5 backend's rule for each kind of battle script event (#107): a table that tsc holds
// complete, as Gen 3's HANDLERS (src/gen3/translate/index.ts), so a new kind in the battle script
// fails the build until it has a rule here, and an event of a kind outside the table fails by
// name. Each rule says what becomes of its event; the kinds that do not play yet name the issue
// that plays them (lane plan §4).
import type { ScriptEvent } from '../../script/events.ts'
import type { Effect } from '../../script/types.ts'
import { type Gen5Fallback, laterFallback, lineFallback } from './fallbacks.ts'

/** What becomes of an event. `park`: the park shows it (#106). `game`: the game shows it itself.
 * `boundary`: it parts the blocks. `play`: the writer plays it where its Pokémon stand in place
 * (moves.ts). `later`: issue `issue` plays it. `line`: Black 2 has no line for it, and nothing
 * shows. */
export type Outcome =
  | { readonly as: 'park' | 'game' | 'boundary' | 'play' }
  | { readonly as: 'later'; readonly issue: number }
  | { readonly as: 'line'; readonly detail: string }

/** Where an event stands: `afterLeads` once the first turn began. */
interface RuleContext {
  readonly afterLeads: boolean
}

/** The event of one kind, also where one event type carries two kinds (`sideStart | sideEnd`). */
export type EventOf<K extends ScriptEvent['kind']> = ScriptEvent extends infer E
  ? E extends { readonly kind: infer Kinds }
    ? K extends Kinds
      ? E
      : never
    : never
  : never

type Rule<K extends ScriptEvent['kind']> = (event: EventOf<K>, ctx: RuleContext) => Outcome

/** The issues that play what does not play yet: switches and faints, the effects (status,
 * stats, weather, hazards, items, abilities), and a whole replay. */
export const LATER_ISSUES = { switches: 108, effects: 109, whole: 110 } as const

const PLAY = { as: 'play' } as const
const SWITCHES = { as: 'later', issue: LATER_ISSUES.switches } as const
const EFFECTS = { as: 'later', issue: LATER_ISSUES.effects } as const
const WHOLE = { as: 'later', issue: LATER_ISSUES.whole } as const

const park = (): Outcome => ({ as: 'park' })
const play = (): Outcome => PLAY
const switches = (): Outcome => SWITCHES
const effects = (): Outcome => EFFECTS
const whole = (): Outcome => WHOLE

/** Leftovers: the one cause of a heal that plays (hits.ts). */
export const isLeftovers = (cause: Effect | undefined) =>
  cause?.kind === 'item' && cause.name === 'Leftovers'

const RULES = {
  player: park,
  teamSize: park,
  battleStart: park,
  turn: () => ({ as: 'boundary' }),
  switchIn: (_, ctx) => (ctx.afterLeads ? SWITCHES : { as: 'game' }),
  faint: switches,
  message: (event) => ({ as: 'line', detail: `Black 2 has no line for "${event.text}"` }),
  win: whole,
  tie: whole,
  move: (event) => (event.calledBy === undefined ? PLAY : EFFECTS),
  prepare: whole,
  anim: whole,
  cant: effects,
  miss: play,
  ohko: whole,
  noTarget: whole,
  immune: (event) => (event.cause === undefined && event.effect === undefined ? PLAY : EFFECTS),
  fail: (event) => {
    const plain = [event.cause, event.effect, event.stat, event.weak].every((x) => x === undefined)
    return plain ? PLAY : EFFECTS
  },
  block: effects,
  damage: (event) => (event.cause === undefined ? PLAY : EFFECTS),
  heal: (event) => (isLeftovers(event.cause) ? PLAY : EFFECTS),
  setHp: whole,
  status: effects,
  cureStatus: effects,
  cureTeam: effects,
  statChange: effects,
  statLimit: effects,
  statReset: effects,
  negativeStatReset: effects,
  crit: effects,
  effectiveness: effects,
  hitCount: whole,
  effectStart: effects,
  effectEnd: effects,
  effectActivate: effects,
  transform: whole,
  formChange: whole,
  terastallize: whole,
  singleTurn: effects,
  singleMove: effects,
  copyBoost: effects,
  weather: effects,
  sideStart: effects,
  sideEnd: effects,
  fieldActivate: effects,
  item: effects,
  itemEnd: effects,
  ability: effects,
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

/** What becomes of each event, by its rule. */
export function outcomesOf(events: readonly ScriptEvent[]): Outcome[] {
  const after = afterLeads(events)
  return events.map((event, i) => ruleOf(event)(event, { afterLeads: after[i] ?? false }))
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
