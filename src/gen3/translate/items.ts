// Held items (plan §6). The stream holds what each Pokémon holds (ITEM). An item a Pokémon gets is
// set first; Thief's theft then plays (`BattleScript_ItemSteal`) and is said. An item gone is said,
// then cleared; an eaten berry plays its animation instead (`BattleScript_BerryCureStatusRet`),
// and the cure after it names the berry. An item the expansion lacks is text alone (plan §4).
import { itemOf } from '../tables/lookup'
import { isSteal, itemRemoved, itemShown } from '../text/phrases-items'
import type { Context, EventOf } from './context'

/** The item's number, or undefined for an item the expansion lacks, which is listed. */
function heldItem(ctx: Context, line: number, name: string): number | undefined {
  const found = itemOf(name)
  ctx.note(line, found.fallback)
  return found.fallback === undefined ? found.number : undefined
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
    ctx.emit(line, { op: 'anim', side: ctx.activeSide(who), anim: 'heldItemBerry' })
  } else if (!event.silent) {
    ctx.print(line, itemRemoved(ctx.mon(who), event.item, cause, source && ctx.mon(source)))
  }
  if (number !== undefined) ctx.emit(line, { op: 'item', side: who.side, slot: who.index, item: 0 })
}
