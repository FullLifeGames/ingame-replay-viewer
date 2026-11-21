// HP changes (plan §6), in the order of the expansion's scripts. A move's hit plays its sound and
// hit animation, moves the bar, then says a critical hit and the effectiveness. Damage with a
// cause follows the cause's script (`battle_scripts_1.s`): weather and confusion say it, hit and
// move the bar; poison and burn say it, play the status animation and move the bar; Leech Seed
// drains first; hazards, recoil, items and abilities move the bar before the line.
import { toID } from '@pkmn/dex'

import type { Anim } from '../stream/instructions'
import { critical, effective } from '../text/phrases'
import { healed, hurt, isTrapping, wishCameTrue } from '../text/phrases-hp'
import { type Context, type EventOf, type PrintText, sameMon } from './context'
import { scaleHp } from './scale'

type Step = 'say' | 'hit' | 'bar' | Anim

const SAY_HIT_BAR: readonly Step[] = ['say', 'hit', 'bar']
const SAY_BAR: readonly Step[] = ['say', 'bar']
const BAR_SAY: readonly Step[] = ['bar', 'say']

/** By the cause's id; trapping moves say it first, every other cause moves the bar first. */
const CAUSED: Readonly<Record<string, readonly Step[]>> = {
  sandstorm: SAY_HIT_BAR,
  hail: SAY_HIT_BAR,
  confusion: SAY_HIT_BAR,
  psn: ['say', 'statusPsn', 'bar'],
  tox: ['say', 'statusPsn', 'bar'],
  brn: ['say', 'statusBrn', 'bar'],
  leechseed: ['leechSeedDrain', 'bar', 'say'],
  curse: SAY_BAR,
  nightmare: SAY_BAR,
}

type DamageEvent = EventOf<'damage'>
type HealEvent = EventOf<'heal'>
type HpEvent = DamageEvent | HealEvent

export function damage(event: DamageEvent, ctx: Context): void {
  const { who, cause } = event
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
  const { line } = event
  const side = ctx.activeSide(event.who)
  ctx.emit(line, { op: 'hit', side, effectiveness: event.effectiveness ?? 'normal' })
  bar(event, ctx)
  if (event.crit) ctx.print(line, critical())
  if (event.effectiveness !== undefined) ctx.print(line, effective(event.effectiveness))
}

/** Leftovers and the other held items play their effect first; Wish plays and names its wisher. */
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
    play(cause?.kind === 'item' ? ['heldItemEffect', 'bar', 'say'] : BAR_SAY, event, ctx, text)
  }
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

function bar({ who, line, hp }: HpEvent, ctx: Context): void {
  ctx.emit(line, { op: 'hp', side: ctx.activeSide(who), hp: scaleHp(hp) })
}
