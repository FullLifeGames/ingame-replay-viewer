// HP changes (plan §6), in the order of the expansion's scripts. A move's hit plays its sound and
// hit animation, moves the bar, then says a critical hit and the effectiveness. Damage with a
// cause follows the cause's script (`battle_scripts_1.s`): weather and confusion say it, hit and
// move the bar; poison and burn say it, play the status animation and move the bar; Leech Seed
// drains first; hazards, recoil, items and abilities move the bar before the line. A held item's
// heal shows its pop-up and says nothing (`BattleScript_ItemHealHP_Ret`).
import { toID } from '@pkmn/dex'

import type { ScriptEvent } from '../../script/events'
import type { PokemonRef } from '../../script/types'
import type { Anim } from '../stream/instructions'
import { healed, hurt, isTrapping, wishCameTrue } from '../text/phrases-hp'
import { type Context, type EventOf, type PrintText, sameMon } from './context'
import { hit, hitLines } from './hits'
import { itemPopUp, shownBefore } from './items'
import { scaleHp } from './scale'
import { STATUS_ANIM } from './status'

type Step = 'say' | 'hit' | 'bar' | Anim

const SAY_HIT_BAR: readonly Step[] = ['say', 'hit', 'bar']
const SAY_BAR: readonly Step[] = ['say', 'bar']
const BAR_SAY: readonly Step[] = ['bar', 'say']

/** By the cause's id; trapping moves say it first, every other cause moves the bar first. */
const CAUSED: Readonly<Record<string, readonly Step[]>> = {
  sandstorm: SAY_HIT_BAR,
  hail: SAY_HIT_BAR,
  confusion: SAY_HIT_BAR,
  psn: ['say', STATUS_ANIM.psn, 'bar'],
  tox: ['say', STATUS_ANIM.tox, 'bar'],
  brn: ['say', STATUS_ANIM.brn, 'bar'],
  leechseed: ['leechSeedDrain', 'bar', 'say'],
  curse: SAY_BAR,
  nightmare: SAY_BAR,
}

type DamageEvent = EventOf<'damage'>
type HealEvent = EventOf<'heal'>
type HpEvent = DamageEvent | HealEvent

/**
 * The HP a Substitute costs: the damage with no cause right after its start's line, on the same
 * Pokémon. The engine moves the bar before that line (`BattleScript_EffectSubstitute`), so the
 * start plays the bar and the damage adds nothing.
 */
export function isSubstituteCost(start: ScriptEvent | undefined, cost: DamageEvent): boolean {
  return (
    start?.kind === 'effectStart' &&
    start.silent !== true &&
    toID(start.effect.name) === 'substitute' &&
    cost.cause === undefined &&
    sameMon(start.who, cost.who)
  )
}

export function damage(event: DamageEvent, ctx: Context): void {
  const { who, cause } = event
  if (isSubstituteCost(ctx.near(-1), event)) return
  // HP a move's user pays itself (Substitute, Belly Drum) moves the bar with no hit.
  if (event.silent || (cause === undefined && sameMon(ctx.mover, who))) {
    bar(event, ctx)
  } else if (cause === undefined) {
    moveHit(event, ctx)
  } else {
    const steps = CAUSED[toID(cause.name)] ?? (isTrapping(cause.name) ? SAY_BAR : BAR_SAY)
    play(steps, event, ctx, hurt(ctx.mon(who), cause, event.source && ctx.mon(event.source)))
  }
}

function moveHit(event: DamageEvent, ctx: Context): void {
  hit(event.line, ctx.activeSide(event.who), event.effectiveness, ctx)
  bar(event, ctx)
  hitLines(event, ctx)
}

/** A held item heals as `itemHeal` says; Wish plays and names its wisher. */
export function heal(event: HealEvent, ctx: Context): void {
  const { who, cause, wisher } = event
  if (event.silent) {
    bar(event, ctx)
    return
  }
  const text = healed(ctx.mon(who), cause, event.source && ctx.mon(event.source))
  if (wisher !== undefined) {
    play(['wishHeal', 'say', 'bar'], event, ctx, wishCameTrue(ctx.mon(wisher)))
    ctx.print(event.line, text)
  } else {
    play(cause?.kind === 'item' ? itemHeal(event, cause.name, ctx) : BAR_SAY, event, ctx, text)
  }
}

/**
 * A held item's heal says nothing in the expansion: Leftovers and Shell Bell show the pop-up and
 * play the held item effect (`BattleScript_ItemHealHP_Ret`), a berry already shown and played by
 * its `-enditem` heals alone (`BattleScript_ItemHealHP_RemoveBerry`). An item without a pop-up
 * keeps our line as its stand-in.
 */
function itemHeal(event: HealEvent, item: string, ctx: Context): readonly Step[] {
  if (shownBefore(event.who, item, ctx)) return ['simpleHeal', 'bar']
  if (itemPopUp(event.who, item, event.line, ctx)) return ['heldItemEffect', 'simpleHeal', 'bar']
  return ['heldItemEffect', 'bar', 'say']
}

/** The steps of one HP change; `say` prints `text`. */
function play(steps: readonly Step[], event: HpEvent, ctx: Context, text: PrintText): void {
  const side = ctx.activeSide(event.who)
  for (const step of steps) {
    if (step === 'say') ctx.print(event.line, text)
    else if (step === 'bar') bar(event, ctx)
    else if (step === 'hit') ctx.emit(event.line, { op: 'hit', side, effectiveness: 'normal' })
    else ctx.emit(event.line, { op: 'anim', side, anim: step })
  }
}

export function bar({ who, line, hp }: HpEvent, ctx: Context): void {
  ctx.emit(line, { op: 'hp', side: ctx.activeSide(who), hp: scaleHp(hp) })
}

/**
 * Empties the bar of a Pokémon that faints with no HP line in the log: Destiny Bond's attacker
 * and a perish count at 0. The expansion drains the bar before these faints
 * (`BattleScript_DestinyBondTakesLife`, `BattleScript_PerishSongTakesLife`).
 */
export function drain(who: PokemonRef, line: number, ctx: Context): void {
  ctx.emit(line, { op: 'hp', side: ctx.activeSide(who), hp: 0 })
}
