// Switches and faints (plan §6), in the order of the expansion's scripts: a switch calls the old
// Pokémon back and sends the new one; Roar (`BattleScript_RoarSuccessSwitch`) and Baton Pass
// (`BattleScript_EffectBatonPass`) return it without a word; a faint plays before its line.
// Destiny Bond's attacker hears the held line and drains its bar before it faints; a target that
// a multi-hit move's last hit knocks out hears the move's last lines after its own.
import { fainted } from '../text/phrases'
import { draggedOut, sentOut, withdrawn } from '../text/phrases-field'
import type { Context, EventOf } from './context'
import { takeDown } from './effects'
import { afterFaint } from './hits'
import { endIntro, sendOutLead } from './intro'
import { scaleHp } from './scale'

type SwitchInEvent = EventOf<'switchIn'>

export function switchIn(event: SwitchInEvent, ctx: Context): void {
  // Each side's first switch-in while the intro runs is its lead; any later one ends the intro.
  if (ctx.leads?.[event.who.side].length === 0) {
    sendOutLead(event, ctx, ctx.leads)
    return
  }
  endIntro(ctx)
  withdraw(event, ctx)
  const { who, line } = event
  const status = event.status ?? 'none'
  const entering = { side: who.side, slot: who.index, hp: scaleHp(event.hp), status } as const
  if (event.dragged) {
    ctx.emit(line, { op: 'switchIn', ...entering })
    ctx.print(line, draggedOut(ctx.mon(who)))
  } else {
    ctx.print(line, sentOut(ctx.mon(who), ctx.player(who.side).text))
    ctx.emit(line, { op: 'switchIn', ...entering })
  }
  ctx.enter(who)
}

/** The Pokémon a switch replaces goes back; only a switch of the trainer's own choice says so. */
function withdraw({ replaces, dragged, cause, line }: SwitchInEvent, ctx: Context): void {
  if (replaces === undefined) return
  const side = ctx.activeSide(replaces)
  if (!dragged && cause === undefined) {
    ctx.print(line, withdrawn(ctx.mon(replaces), ctx.player(side).text))
  }
  ctx.emit(line, { op: 'withdraw', side })
}

export function faint({ who, line }: EventOf<'faint'>, ctx: Context): void {
  takeDown(who, line, ctx)
  ctx.emit(line, { op: 'faint', side: ctx.activeSide(who) })
  ctx.print(line, fainted(ctx.mon(who)))
  afterFaint(who, ctx)
  ctx.leave(who.side)
}
