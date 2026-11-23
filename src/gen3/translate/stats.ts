// Stat changes (plan §6): the expansion plays one arrow animation for the stats a move raises or
// lowers together (`TryPlayStatChangeAnimation`, `battle_stat_change.c`), then says each change.
// A run is the stat changes of one Pokémon in one direction, one right after the other.
// A stat at its limit plays no arrows and says so, one line per stat, as `TryStatChange` walks
// the queue one stat at a time (`B_MSG_STAT_WONT_CHANGE`):
// `IncreaseStat` picks `STRINGID_STATSWONTINCREASE` "{B_SCR_NAME_WITH_PREFIX}'s {B_BUFF1} won't go
// any higher!" and `DecreaseStat` `STRINGID_STATSWONTDECREASE` "… won't go any lower!"
// (`battle_stat_change.c`, `battle_message.c`). Belly Drum plays its arrows like any change, then
// says the maxed Attack, its own message (`B_MSG_STAT_CHANGED_BELLY_DRUM`). Haze resets every
// stage with no stat animation and says so once (`BattleScript_EffectHaze`).
import type { ScriptEvent } from '../../script/events'
import { statChanged, statChangesGone, statWontChange } from '../text/phrases'
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
  ctx.print(line, statChanged(ctx.mon(who), stat, stages, event.cause))
}

export function statLimit(
  { who, stat, direction, line }: EventOf<'statLimit'>,
  ctx: Context,
): void {
  ctx.print(line, statWontChange(ctx.mon(who), stat, direction))
}

export function statReset({ line }: EventOf<'statReset'>, ctx: Context): void {
  ctx.print(line, statChangesGone())
}
