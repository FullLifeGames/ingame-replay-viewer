// Held items (plan §6). The stream holds what each Pokémon holds (ITEM). An item a Pokémon gets is
// set first; Thief's theft then plays (`BattleScript_ItemSteal`, no pop-up) and is said. An item
// gone is said, then cleared. An eaten berry shows its pop-up and plays its animation instead
// (`BattleScript_ItemPopUp_Scripting`, then `B_ANIM_HELD_ITEM_BERRY` in
// `BattleScript_BerryCureStatusRet`, `BattleScript_ItemHealHP_RemoveBerry` and
// `BattleScript_ConsumableBerryStatRaise`); the cure or heal after it names the berry. An item the
// expansion lacks is text alone (plan §4) and shows no pop-up.
import { toID } from '@pkmn/dex'

import type { PokemonRef } from '../../script/types'
import { itemOf } from '../tables/lookup'
import { isSteal, itemRemoved, itemShown } from '../text/phrases-items'
import { type Context, type EventOf, sameMon } from './context'

/** The item's number, or undefined for an item the expansion lacks, which is listed. */
function heldItem(ctx: Context, line: number, name: string): number | undefined {
  const found = itemOf(name)
  ctx.note(line, found.fallback)
  return found.fallback === undefined ? found.number : undefined
}

/**
 * Shows the pop-up of `name` over `who` (ITEM_POP_UP: the text box emptied, the pop-up, its
 * wait) and says whether it did: an item the expansion lacks has none and is listed.
 */
export function itemPopUp(who: PokemonRef, name: string, line: number, ctx: Context): boolean {
  const number = heldItem(ctx, line, name)
  if (number !== undefined) showPopUp(who, number, line, ctx)
  return number !== undefined
}

function showPopUp(who: PokemonRef, item: number, line: number, ctx: Context): void {
  ctx.emit(line, { op: 'itemPopUp', side: ctx.activeSide(who), item })
}

/** The berry `who` ate on the line before the event in hand, if it ate one there. */
export function eatenBefore(who: PokemonRef, ctx: Context): string | undefined {
  const before = ctx.near(-1)
  return before?.kind === 'itemEnd' && before.eaten && sameMon(before.who, who)
    ? before.item
    : undefined
}

/** Whether the berry `name` that `who` ate on the line before showed its pop-up. */
export function shownBefore(who: PokemonRef, name: string, ctx: Context): boolean {
  const eaten = eatenBefore(who, ctx)
  return eaten !== undefined && toID(eaten) === toID(name) && itemOf(name).fallback === undefined
}

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

export function itemEnd(event: EventOf<'itemEnd'>, ctx: Context): void {
  const { who, cause, source, line } = event
  const number = heldItem(ctx, line, event.item)
  if (event.eaten) {
    if (number !== undefined) showPopUp(who, number, line, ctx)
    ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim: 'heldItemBerry' })
  } else if (!event.silent) {
    ctx.print(line, itemRemoved(ctx.mon(who), event.item, cause, source && ctx.mon(source)))
  }
  if (number !== undefined) ctx.emit(line, { op: 'item', side: who.side, slot: who.index, item: 0 })
}
