// Effects on one Pokémon (plan §6). Substitute is the one the stream holds (VOLATILE): it starts,
// moves the bar by its HP cost and says so; a hit on it plays the hit and says the substitute took
// the damage (`CancelerHealthBarUpdate`); a hit that breaks it then fades it
// (`BattleScript_SubstituteFade`) before the critical hit and effectiveness lines. Other effects
// are a line each; a silent one the stream has no state for is a mechanic fallback. The log puts
// Destiny Bond's line before both faints; the game says it after the holder's faint, then drains
// the attacker's bar (`BattleScript_DestinyBondTakesLife`), so the line waits for that faint. A
// perish count at 0 drains the bar after its line (`BattleScript_PerishSongTakesLife`).
import { toID } from '@pkmn/dex'

import type { PokemonRef } from '../../script/types'
import { mechanicGap } from '../fallbacks'
import type { Anim, Volatile } from '../stream/instructions'
import {
  blocked,
  effectActivated,
  effectEnded,
  effectStarted,
  singleTurn as lastsTheTurn,
} from '../text/phrases-effects'
import { type Context, type EventOf, sameMon } from './context'
import { bar, drain, hitLines, isSubstituteCost } from './hp'

const VOLATILES: Partial<Readonly<Record<string, Volatile>>> = { substitute: 'substitute' }

const DESTINY_BOND = 'destinybond'
const PERISH_ZERO = 'perish0'

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
  if (!event.silent) startLine(event, ctx)
  else if (volatile === undefined) ctx.note(line, mechanicGap(effect.name, 'starting'))
}

/** The line of an effect that starts; a perish count at 0 then drains the bar. */
function startLine(event: EventOf<'effectStart'>, ctx: Context): void {
  const { who, effect, line } = event
  ctx.print(line, effectStarted(ctx.mon(who), effect, event.source && ctx.mon(event.source)))
  if (toID(effect.name) === PERISH_ZERO) drain(who, line, ctx)
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
  if (who !== undefined && takesDown(event, who, ctx)) {
    ctx.takenDown = { ...event, who }
    return
  }
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

/** Destiny Bond waits when a faint of another Pokémon, its attacker, follows in the turn. */
function takesDown(event: EventOf<'effectActivate'>, holder: PokemonRef, ctx: Context): boolean {
  if (toID(event.effect.name) !== DESTINY_BOND) return false
  for (const later of ctx.script.events.slice(ctx.at + 1)) {
    if (later.kind === 'turn') return false
    if (later.kind === 'faint' && !sameMon(holder, later.who)) return true
  }
  return false
}

/** Before the faint of Destiny Bond's attacker `who`: the held line, then its bar drains. */
export function takeDown(who: PokemonRef, line: number, ctx: Context): void {
  const held = ctx.takenDown
  if (held === undefined || sameMon(held.who, who)) return
  ctx.takenDown = undefined
  ctx.print(held.line, effectActivated(ctx.mon(held.who), held.effect))
  drain(who, line, ctx)
}

export function singleTurn({ who, effect, line }: EventOf<'singleTurn'>, ctx: Context): void {
  const anim = SINGLE_TURN_ANIM[toID(effect.name)]
  if (anim !== undefined) ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim })
  ctx.print(line, lastsTheTurn(ctx.mon(who), effect))
}

export function block({ who, effect, line }: EventOf<'block'>, ctx: Context): void {
  ctx.print(line, blocked(ctx.mon(who), effect))
}
