// Held items (plan §6). The stream holds what each Pokémon holds (ITEM). An item a Pokémon gets is
// set first; Thief's theft then plays (`BattleScript_ItemSteal`, no pop-up) and is said. An item
// gone is said, then cleared. An eaten berry shows its pop-up and plays its animation instead
// (`BattleScript_ItemPopUp_Scripting`, then `B_ANIM_HELD_ITEM_BERRY` in
// `BattleScript_BerryCureStatusRet`, `BattleScript_ItemHealHP_RemoveBerry` and
// `BattleScript_ConsumableBerryStatRaise`); the cure or heal after it names the berry. An item
// used for the stat change the next line makes, such as Berserk Gene, shows its pop-up and plays
// the held item animation (`BattleScript_BerserkGene`); the change names the item. White Herb does
// the same before the reset of the lowered stages (`BattleScript_WhiteHerbRet`), and Berry Juice
// before its heal (`BattleScript_ItemHealHP_RemoveItem`). A berry eaten for confusion alone plays
// its animation with no pop-up (`BattleScript_BerryCureConfusionRet`); one that cures a status
// too names itself again as the confusion ends (`BattleScript_BerryCureStatusAndConfusionRet`).
// An item the expansion lacks is text alone (plan §4) and shows no pop-up.
import { Dex, toID } from '@pkmn/dex'

import type { ScriptEvent } from '../../script/events'
import type { PokemonRef } from '../../script/types'
import { itemOf } from '../tables/lookup'
import { isSteal, itemRemoved, itemShown } from '../text/phrases-items'
import { type Context, type EventOf, sameMon } from './context'

/** The expansion's number of the item, or undefined for an item it lacks. */
function numberOf(name: string): number | undefined {
  const found = itemOf(name)
  return found.fallback === undefined ? found.number : undefined
}

/** The item's number, or undefined for an item the expansion lacks, which is listed. */
function heldItem(ctx: Context, line: number, name: string): number | undefined {
  ctx.note(line, itemOf(name).fallback)
  return numberOf(name)
}

/**
 * The item the pop-up of `name` shows, or undefined for none. The one home of that decision:
 * every item the expansion has shows its pop-up, one it lacks shows none.
 */
function popUpOf(name: string): number | undefined {
  return numberOf(name)
}

/**
 * Shows the pop-up of `name` over `who` (ITEM_POP_UP: the text box emptied, the pop-up, its
 * wait) and says whether it did. An item the expansion lacks is listed.
 */
export function itemPopUp(who: PokemonRef, name: string, line: number, ctx: Context): boolean {
  heldItem(ctx, line, name)
  return showPopUp(who, name, line, ctx)
}

function showPopUp(who: PokemonRef, name: string, line: number, ctx: Context): boolean {
  const item = popUpOf(name)
  if (item !== undefined) ctx.emit(line, { op: 'itemPopUp', side: ctx.activeSide(who), item })
  return item !== undefined
}

/** The berry `who` ate `offset` events from the one in hand, if it ate one there. */
function eatenAt(offset: number, who: PokemonRef, ctx: Context): string | undefined {
  const event = ctx.near(offset)
  return event?.kind === 'itemEnd' && event.eaten && sameMon(event.who, who)
    ? event.item
    : undefined
}

/** The berry `who` ate on the line before the event in hand, if it ate one there. */
export const eatenBefore = (who: PokemonRef, ctx: Context) => eatenAt(-1, who, ctx)

/**
 * The berry `who` ate for the confusion the event in hand ends: on the line before, or on the
 * line before its status cure (Lum Berry, `BattleScript_BerryCureStatusAndConfusionRet`).
 */
export function eatenForConfusion(who: PokemonRef, ctx: Context): string | undefined {
  const before = ctx.near(-1)
  const cured = before?.kind === 'cureStatus' && sameMon(before.who, who)
  return eatenAt(cured ? -2 : -1, who, ctx)
}

/**
 * Whether the item `name` that `who` ate or used up on the line before showed its pop-up: a berry
 * eaten for its heal (Sitrus Berry), or an item used up for it (Berry Juice).
 */
export function shownBefore(who: PokemonRef, name: string, ctx: Context): boolean {
  const before = eatenBefore(who, ctx) ?? usedUpBefore(who, ctx)
  return before !== undefined && toID(before) === toID(name) && popUpOf(name) !== undefined
}

/** Whether `event` ends the confusion of `who`. */
export const endsConfusion = (event: ScriptEvent | undefined, who: PokemonRef) =>
  event?.kind === 'effectEnd' && sameMon(event.who, who) && toID(event.effect.name) === 'confusion'

export function item(event: EventOf<'item'>, ctx: Context): void {
  const { who, cause, source, line } = event
  const number = heldItem(ctx, line, event.item)
  if (number !== undefined) {
    ctx.emit(line, { op: 'item', side: who.side, slot: who.index, item: number })
  }
  if (isSteal(cause) && source !== undefined) {
    ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim: 'itemSteal' })
  }
  ctx.print(line, itemShown(ctx.mon(who), event.item, cause, source && ctx.mon(source)))
}

/** An item used up by its holder: neither eaten, nor taken, nor gone without a word. */
const usedUp = ({ eaten, silent, cause }: EventOf<'itemEnd'>) =>
  !eaten && !silent && cause === undefined

/** The item `who` used up on the line before the event in hand, if it used one there. */
export function usedUpBefore(who: PokemonRef, ctx: Context): string | undefined {
  const before = ctx.near(-1)
  return before?.kind === 'itemEnd' && usedUp(before) && sameMon(before.who, who)
    ? before.item
    : undefined
}

/** Whether `next` is the heal of `who` by the item `name`. */
const healsBy = (next: ScriptEvent | undefined, who: PokemonRef, name: string) =>
  next?.kind === 'heal' &&
  sameMon(next.who, who) &&
  next.cause?.kind === 'item' &&
  toID(next.cause.name) === toID(name)

/**
 * An item used up for what the next line does: the stat changes @pkmn gives it (`boosts`), the
 * reset of the lowered stages that names it (White Herb), or the heal that names it (Berry Juice,
 * `BattleScript_ItemHealHP_RemoveItem`).
 */
function usedForNext(event: EventOf<'itemEnd'>, ctx: Context): boolean {
  if (!usedUp(event)) return false
  const next = ctx.near(1)
  const resets = next?.kind === 'negativeStatReset' && sameMon(next.who, event.who)
  return resets || healsBy(next, event.who, event.item) || Boolean(Dex.items.get(event.item).boosts)
}

/**
 * The Pokémon whose move took the item: `[of]`, or else the last mover on the other side, since
 * Gen 4 logs Knock Off's end with no `[of]` (`-enditem|<target>|<item>|[from] move: Knock Off`).
 */
function takerOf({ who, cause, source }: EventOf<'itemEnd'>, ctx: Context): PokemonRef | undefined {
  if (source !== undefined || cause?.kind !== 'move') return source
  return ctx.mover?.side === who.side ? undefined : ctx.mover
}

export function itemEnd(event: EventOf<'itemEnd'>, ctx: Context): void {
  const { who, cause, line } = event
  const source = takerOf(event, ctx)
  const number = heldItem(ctx, line, event.item)
  if (event.eaten || usedForNext(event, ctx)) {
    // A berry eaten for confusion alone shows none (`BattleScript_BerryCureConfusionRet`).
    if (!(event.eaten && endsConfusion(ctx.near(1), who))) showPopUp(who, event.item, line, ctx)
    const anim = event.eaten ? 'heldItemBerry' : 'heldItemEffect'
    ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim })
  } else if (!event.silent) {
    ctx.print(line, itemRemoved(ctx.mon(who), event.item, cause, source && ctx.mon(source)))
  }
  if (number !== undefined) ctx.emit(line, { op: 'item', side: who.side, slot: who.index, item: 0 })
}
