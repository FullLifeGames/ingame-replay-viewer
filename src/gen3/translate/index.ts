// The battle script to the stream model (plan §6): one handler per event kind, in a table that
// tsc holds complete, so a new kind in the battle script fails the build until it has one.
import type { BattleScript, ScriptEvent } from '../../script/events'
import { Gen3Error } from '../errors'
import type { Fallback } from '../fallbacks'
import type { Stream } from '../stream/instructions'
import { Context, type EventOf, type Placed } from './context'
import { battleStart, endIntro, player, teamSize, turn } from './intro'
import { faint, switchIn } from './switches'
import { tablesOf } from './tables'

type Handler<K extends ScriptEvent['kind']> = (event: EventOf<K>, ctx: Context) => void

// Kinds of step B4b (status, stats, field, effects, items, abilities, end) until it brings them.
const notYet = (event: ScriptEvent) => {
  throw new Gen3Error(`not yet: the ${event.kind} event of line ${String(event.line)}`)
}

const HANDLERS = {
  player,
  teamSize,
  battleStart,
  turn,
  switchIn,
  faint,
  message: notYet,
  win: notYet,
  tie: notYet,
  move: notYet,
  cant: notYet,
  miss: notYet,
  immune: notYet,
  fail: notYet,
  block: notYet,
  damage: notYet,
  heal: notYet,
  status: notYet,
  cureStatus: notYet,
  cureTeam: notYet,
  statChange: notYet,
  crit: notYet,
  effectiveness: notYet,
  effectStart: notYet,
  effectEnd: notYet,
  effectActivate: notYet,
  singleTurn: notYet,
  weather: notYet,
  sideStart: notYet,
  sideEnd: notYet,
  fieldActivate: notYet,
  item: notYet,
  itemEnd: notYet,
  ability: notYet,
} satisfies { readonly [K in ScriptEvent['kind']]: Handler<K> }

export interface Translation extends Omit<Stream, 'instructions'> {
  readonly instructions: readonly Placed[]
  /** In line order. */
  readonly fallbacks: readonly Fallback[]
}

export function translate(script: BattleScript): Translation {
  const ctx = new Context(script)
  for (const event of script.events) {
    if (event.kind !== 'switchIn') endIntro(ctx)
    const handle = HANDLERS[event.kind] as (event: ScriptEvent, ctx: Context) => void
    handle(event, ctx)
  }
  endIntro(ctx)
  closeStream(ctx)
  const tables = tablesOf(ctx)
  const fallbacks = ctx.fallbacks.toSorted((a, b) => a.line - b.line)
  return { ...tables, instructions: ctx.instructions, fallbacks }
}

/** A log without a result ends with an END of unknown outcome, on its last line. */
function closeStream(ctx: Context): void {
  if (ctx.instructions.at(-1)?.instruction.op === 'end') return
  const lines = [...ctx.script.events, ...ctx.script.dropped].map(({ line }) => line)
  ctx.emit(Math.max(0, ...lines), { op: 'end', outcome: 'unknown' })
}
