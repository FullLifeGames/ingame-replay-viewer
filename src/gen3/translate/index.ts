// The battle script to the stream model (plan §6): one handler per event kind, in a table that
// tsc holds complete, so a new kind in the battle script fails the build until it has one.
import type { BattleScript, ScriptEvent } from '../../script/events'
import type { Fallback } from '../fallbacks'
import type { Stream } from '../stream/instructions'
import { ability, closePopUp, inCausePopUp } from './abilities'
import { Context, type EventOf, type Placed } from './context'
import {
  block,
  copyBoost,
  effectActivate,
  effectEnd,
  effectStart,
  singleMove,
  singleTurn,
  transform,
} from './effects'
import { message, tie, win } from './end'
import { fieldActivate, sideEnd, sideStart, weather } from './field'
import { formChange, terastallize } from './forms'
import { showHidden } from './hidden'
import { item, itemEnd } from './items'
import { battleStart, endIntro, player, teamSize, turn } from './intro'
import { hitCount } from './hits'
import { damage, heal, setHp } from './hp'
import {
  anim,
  crit,
  effectiveness,
  failure,
  immunity,
  miss,
  move,
  noTarget,
  ohko,
  prepare,
} from './moves'
import { negativeStatReset, statChange, statLimit, statReset } from './stats'
import { cant, cureStatus, cureTeam, status } from './status'
import { faint, switchIn } from './switches'
import { tablesOf } from './tables'

type Handler<K extends ScriptEvent['kind']> = (event: EventOf<K>, ctx: Context) => void

const HANDLERS = {
  player,
  teamSize,
  battleStart,
  turn,
  switchIn,
  faint,
  message,
  win,
  tie,
  move,
  prepare,
  anim,
  cant,
  miss,
  ohko,
  noTarget,
  immune: immunity,
  fail: failure,
  block,
  damage,
  heal,
  setHp,
  status,
  cureStatus,
  cureTeam,
  statChange,
  statLimit,
  statReset,
  negativeStatReset,
  crit,
  effectiveness,
  effectStart,
  effectEnd,
  effectActivate,
  transform,
  formChange,
  terastallize,
  singleTurn,
  singleMove,
  copyBoost,
  weather,
  sideStart,
  sideEnd,
  fieldActivate,
  item,
  itemEnd,
  ability,
  hitCount,
} satisfies { readonly [K in ScriptEvent['kind']]: Handler<K> }

export interface Translation extends Omit<Stream, 'instructions'> {
  readonly instructions: readonly Placed[]
  /** In line order. */
  readonly fallbacks: readonly Fallback[]
}

export function translate(script: BattleScript): Translation {
  const ctx = new Context(script)
  for (const [index, event] of script.events.entries()) {
    ctx.at = index
    if (event.kind !== 'switchIn') endIntro(ctx)
    closePopUp(event, ctx)
    const handle = HANDLERS[event.kind] as (event: ScriptEvent, ctx: Context) => void
    inCausePopUp(event, ctx, () => {
      handle(event, ctx)
    })
    showHidden(event, ctx)
  }
  endIntro(ctx)
  closePopUp(undefined, ctx)
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
