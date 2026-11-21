// Effects on one Pokémon (plan §6). Substitute is the one the stream holds (VOLATILE): it starts,
// moves the bar by its HP cost and says so; a hit on it plays the hit and says the substitute took
// the damage (`CancelerHealthBarUpdate`); a hit that breaks it then fades it
// (`BattleScript_SubstituteFade`) before the critical hit and effectiveness lines. Other effects
// are a line each; a silent one the stream has no state for is a mechanic fallback.
import { toID } from '@pkmn/dex'

import { mechanicGap } from '../fallbacks'
import type { Anim, Volatile } from '../stream/instructions'
import {
  blocked,
  effectActivated,
  effectEnded,
  effectStarted,
  singleTurn as lastsTheTurn,
} from '../text/phrases-effects'
import type { Context, EventOf } from './context'
import { bar, hitLines, isSubstituteCost } from './hp'

const VOLATILES: Partial<Readonly<Record<string, Volatile>>> = { substitute: 'substitute' }

const SINGLE_TURN_ANIM: Partial<Readonly<Record<string, Anim>>> = {
  focuspunch: 'focusPunchSetup',
}

export function effectStart(event: EventOf<'effectStart'>, ctx: Context): void {
  const { who, effect, line } = event
  const volatile = VOLATILES[toID(effect.name)]
  if (volatile !== undefined) {
    ctx.emit(line, { op: 'volatile', side: ctx.activeSide(who), volatile, on: true })
  }
  const cost = ctx.near(1)
  if (cost?.kind === 'damage' && isSubstituteCost(event, cost)) bar(cost, ctx)
  if (!event.silent) {
    ctx.print(line, effectStarted(ctx.mon(who), effect, event.source && ctx.mon(event.source)))
  } else if (volatile === undefined) {
    ctx.note(line, mechanicGap(effect.name, 'starting'))
  }
}

export function effectEnd(event: EventOf<'effectEnd'>, ctx: Context): void {
  const { who, effect, line } = event
  const volatile = VOLATILES[toID(effect.name)]
  if (volatile === 'substitute' && !event.silent) {
    substituteBreaks(event, ctx)
    return
  }
  if (!event.silent) ctx.print(line, effectEnded(ctx.mon(who), effect))
  if (volatile !== undefined) {
    ctx.emit(line, { op: 'volatile', side: ctx.activeSide(who), volatile, on: false })
  } else if (event.silent) {
    ctx.note(line, mechanicGap(effect.name, 'ending'))
  }
}

/** The hit that breaks a substitute: it takes the damage, fades, then the hit's lines follow. */
function substituteBreaks(event: EventOf<'effectEnd'>, ctx: Context): void {
  const { who, effect, line } = event
  const side = ctx.activeSide(who)
  ctx.emit(line, { op: 'hit', side, effectiveness: event.effectiveness ?? 'normal' })
  ctx.print(line, effectActivated(ctx.mon(who), effect))
  ctx.emit(line, { op: 'anim', side, anim: 'substituteFade' })
  ctx.print(line, effectEnded(ctx.mon(who), effect))
  ctx.emit(line, { op: 'volatile', side, volatile: 'substitute', on: false })
  hitLines(event, ctx)
}

/** A substitute that takes a hit (`[damage]`) plays the hit first; any other effect is a line. */
export function effectActivate(event: EventOf<'effectActivate'>, ctx: Context): void {
  const { who, effect, line } = event
  if (event.damage && who !== undefined) {
    ctx.emit(line, {
      op: 'hit',
      side: ctx.activeSide(who),
      effectiveness: event.effectiveness ?? 'normal',
    })
  }
  ctx.print(line, effectActivated(who && ctx.mon(who), effect))
  hitLines(event, ctx)
}

export function singleTurn({ who, effect, line }: EventOf<'singleTurn'>, ctx: Context): void {
  const anim = SINGLE_TURN_ANIM[toID(effect.name)]
  if (anim !== undefined) ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim })
  ctx.print(line, lastsTheTurn(ctx.mon(who), effect))
}

export function block({ who, effect, line }: EventOf<'block'>, ctx: Context): void {
  ctx.print(line, blocked(ctx.mon(who), effect))
}
