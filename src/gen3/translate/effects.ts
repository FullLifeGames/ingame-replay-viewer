// Effects on one Pokémon (plan §6). Substitute is the one the stream holds (VOLATILE): it starts,
// moves the bar by its HP cost and says so; a hit on it plays the hit and says the substitute took
// the damage (`CancelerHealthBarUpdate`); a hit that breaks it then fades it
// (`BattleScript_SubstituteFade`) before the critical hit and effectiveness lines. Other effects
// are a line each; a silent one the stream has no state for is a mechanic fallback. The log puts
// Destiny Bond's line before both faints; the game says it after the holder's faint, then drains
// the attacker's bar (`BattleScript_DestinyBondTakesLife`), so the line waits for that faint. A
// perish count at 0 drains the bar after its line (`BattleScript_PerishSongTakesLife`). Pursuit's
// activation shows nothing (`PURSUIT`). Transform says the species its user turned into
// (`BattleScript_EffectTransform`). The MOVE op's animation turns the sprite into the target's
// species, read from its party mon; nothing sets the transform volatiles, so a shiny target's copy
// takes the plain colours, a mechanic fallback.
import { toID } from '@pkmn/dex'

import type { PokemonRef } from '../../script/types'
import { mechanicGap } from '../fallbacks'
import type { Anim, Volatile } from '../stream/instructions'
import {
  blocked,
  copiedStats,
  effectActivated,
  effectEnded,
  effectStarted,
  singleMove as untilNextMove,
  singleTurn as lastsTheTurn,
  transformed,
} from '../text/phrases-effects'
import { type Context, type EventOf, sameMon } from './context'
import { HIT_TURN, isFutureMove } from './anim-turn'
import { hit, hitLines } from './hits'
import { bar, drain, isSubstituteCost } from './hp'
import { playMove } from './moves'

const VOLATILES: Partial<Readonly<Record<string, Volatile>>> = { substitute: 'substitute' }

/**
 * Starts the expansion shows as the move alone: Bide's first turn plays its animation and says
 * nothing (`BattleScript_SetUpBide`); its later turns say their lines.
 */
const SILENT_STARTS: ReadonlySet<string> = new Set(['bide'])

const DESTINY_BOND = 'destinybond'
const PERISH_ZERO = 'perish0'

/**
 * Pursuit on a Pokémon that switches out: the game says "X, come back!" (`STRINGID_RETURNMON`,
 * `BattleScript_ActionSwitch`) before the hit. Our withdraw says it at the switch after the hit,
 * and not at all when the hit knocks the Pokémon out (the log then sends the next one in after
 * the faint). The activation shows nothing and names the mechanic.
 */
const PURSUIT = 'pursuit'

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
  const silent = event.silent ?? SILENT_STARTS.has(toID(effect.name))
  if (!silent) startLine(event, ctx)
  else if (volatile === undefined) ctx.note(line, mechanicGap(effect.name, 'starting'))
}

/** The line of an effect that starts; a perish count at 0 then drains the bar. */
function startLine(event: EventOf<'effectStart'>, ctx: Context): void {
  const { who, effect, line } = event
  const source = event.source && ctx.mon(event.source)
  ctx.print(line, effectStarted(ctx.mon(who), effect, source, event.detail))
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
  if (!event.silent && isFutureMove(effect.name)) futureHit(event, ctx)
  if (volatile !== undefined) {
    ctx.emit(line, { op: 'volatile', side: ctx.activeSide(who), volatile, on: false })
  } else if (event.silent) {
    ctx.note(line, mechanicGap(effect.name, 'ending'))
  }
}

/**
 * A future attack's hit after its line (`BattleScript_MonTookFutureAttack`): the animation of the
 * Pokémon out on the other side, whose hit the damage after it plays. While no Pokémon is out
 * there, the game still plays the animation from the empty side, before the replacement comes in;
 * the stream has no MOVE without a user, so the hit plays none and notes it.
 */
function futureHit(event: EventOf<'effectEnd'>, ctx: Context): void {
  const { who, effect, line } = event
  const user = ctx.activeOn(who.side === 'near' ? 'far' : 'near')
  ctx.mover = user
  if (user === undefined) {
    ctx.note(line, mechanicGap(effect.name, 'hitting from a side with no Pokémon out'))
    return
  }
  playMove({ line, user, move: effect.name }, who, HIT_TURN, ctx)
}

/** The hit that breaks a substitute: it takes the damage, fades, then the hit's lines follow. */
function substituteBreaks(event: EventOf<'effectEnd'>, ctx: Context): void {
  const { who, effect, line } = event
  const side = ctx.activeSide(who)
  hit(line, side, event.effectiveness, ctx)
  ctx.print(line, effectActivated(ctx.mon(who), effect))
  ctx.emit(line, { op: 'anim', side, anim: 'substituteFade' })
  ctx.print(line, effectEnded(ctx.mon(who), effect))
  ctx.emit(line, { op: 'volatile', side, volatile: 'substitute', on: false })
  hitLines(event, ctx)
}

/** A substitute that takes a hit (`[damage]`) plays the hit first; any other effect is a line. */
export function effectActivate(event: EventOf<'effectActivate'>, ctx: Context): void {
  const { who, effect, line } = event
  if (toID(effect.name) === PURSUIT) {
    ctx.note(line, mechanicGap(effect.name, 'acting'))
    return
  }
  if (who !== undefined && takesDown(event, who, ctx)) {
    ctx.takenDown = { ...event, who }
    return
  }
  if (event.damage && who !== undefined) hit(line, ctx.activeSide(who), event.effectiveness, ctx)
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

export function transform({ who, into, line }: EventOf<'transform'>, ctx: Context): void {
  const target = ctx.revealed(into)
  ctx.print(line, transformed(ctx.mon(who), target.species))
  if (target.shiny) ctx.note(line, mechanicGap('Transform', "copying the target's shiny colours"))
}

export function singleTurn({ who, effect, line }: EventOf<'singleTurn'>, ctx: Context): void {
  const anim = SINGLE_TURN_ANIM[toID(effect.name)]
  if (anim !== undefined) ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim })
  ctx.print(line, lastsTheTurn(ctx.mon(who), effect))
}

/** Rage starts without a line; the game says it as a hit raises Attack. */
export function singleMove({ who, effect, line }: EventOf<'singleMove'>, ctx: Context): void {
  const phrase = untilNextMove(ctx.mon(who), effect)
  if (phrase !== undefined) ctx.print(line, phrase)
}

/** Psych Up's line, after its animation; the stream holds no stat stages to copy. */
export function copyBoost({ who, from, line }: EventOf<'copyBoost'>, ctx: Context): void {
  ctx.print(line, copiedStats(ctx.mon(who), ctx.mon(from)))
}

export function block({ who, effect, line }: EventOf<'block'>, ctx: Context): void {
  ctx.print(line, blocked(ctx.mon(who), effect))
}
