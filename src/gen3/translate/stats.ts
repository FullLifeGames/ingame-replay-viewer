// Stat changes (plan §6): the expansion plays one arrow animation for the stats a move raises or
// lowers together (`TryPlayStatChangeAnimation`, `battle_stat_change.c`), then says each change.
// A run is the stat changes of one Pokémon in one direction, one right after the other.
import type { ScriptEvent } from '../../script/events'
import { statChanged } from '../text/phrases'
import { type Context, type EventOf, sameMon } from './context'

type StatChangeEvent = EventOf<'statChange'>

const continues = (event: ScriptEvent | undefined, run: StatChangeEvent) =>
  event?.kind === 'statChange' &&
  sameMon(event.who, run.who) &&
  Math.sign(event.stages) === Math.sign(run.stages)

export function statChange(event: StatChangeEvent, ctx: Context): void {
  const { who, stat, stages, line } = event
  const first = !continues(ctx.near(-1), event)
  const arrows = first ? (continues(ctx.near(1), event) ? 'several' : 'one') : 'none'
  ctx.emit(line, { op: 'stat', side: ctx.activeSide(who), stat, stages, arrows })
  ctx.print(line, statChanged(ctx.mon(who), stat, stages))
}
