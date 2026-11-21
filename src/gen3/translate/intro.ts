// The intro (plan §6): the players and team sizes go into the header, the battle start becomes
// INTRO and the far player's line, and the leads are sent out far first, as `DoBattleIntro` does.
import { fitCharset } from '../text/charset'
import { nameTrainer } from '../text/names'
import { challenged, sentOut } from '../text/phrases-field'
import type { Context, EventOf, Leads } from './context'
import { scaleHp } from './scale'

export function player(event: EventOf<'player'>, ctx: Context): void {
  const text = nameTrainer(event.name)
  ctx.note(event.line, text.fallback)
  ctx.players[event.side] = { header: fitCharset(event.name).text, text: text.text }
}

export function teamSize(event: EventOf<'teamSize'>, ctx: Context): void {
  ctx.teamSizes[event.side] = event.size
}

export function battleStart(event: EventOf<'battleStart'>, ctx: Context): void {
  ctx.emit(event.line, { op: 'intro' })
  ctx.print(event.line, challenged(ctx.player('far').text))
  ctx.leads = { near: [], far: [] }
}

export function turn(event: EventOf<'turn'>, ctx: Context): void {
  ctx.emit(event.line, { op: 'turn', number: event.number })
}

/** A lead switched in while the intro runs: its text and SEND_OUT wait for `endIntro`. */
export function sendOutLead(event: EventOf<'switchIn'>, ctx: Context, leads: Leads): void {
  const { who, line } = event
  ctx.capture(leads[who.side], () => {
    ctx.print(line, sentOut(ctx.mon(who), ctx.player(who.side).text))
    const status = event.status ?? 'none'
    ctx.emit(line, {
      op: 'sendOut',
      side: who.side,
      slot: who.index,
      hp: scaleHp(event.hp),
      status,
    })
  })
  ctx.enter(who)
}

/** The intro ends with the first event that is no lead: the far lead first, then the near one. */
export function endIntro(ctx: Context): void {
  const { leads } = ctx
  if (leads === undefined) return
  ctx.leads = undefined
  ctx.instructions.push(...leads.far, ...leads.near)
}
