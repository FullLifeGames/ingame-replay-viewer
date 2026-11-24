// Rage (`MoveEndRage`, `battle_move_resolution.c`): a hit on a Pokémon in a rage raises its Attack
// by one stage, and `BattleScript_RageIsBuilding` plays the arrows, says the raise, then says
// STRINGID_PKMNRAGEBUILDING. Showdown's Gen 1 rules log the raise `[from] Rage`; its Gen 2 and 3
// rules log the start as `-singlemove|<mon>|Rage` and the raise with no cause, so a raise of one
// stage after a hit on a Pokémon whose last move started Rage is the rage's.
import { toID } from '@pkmn/dex'

import type { ScriptEvent } from '../../script/events'
import type { PokemonRef } from '../../script/types'
import { type Context, type EventOf, sameMon } from './context'

const RAGE = 'rage'

const isHitOn = (event: ScriptEvent, who: PokemonRef) =>
  event.kind === 'damage' && sameMon(event.who, who) && event.cause === undefined

/**
 * Whether Rage is on `who` in `before`, the events from the latest back: its start comes before
 * any move or switch-in of its own.
 */
function inRage(who: PokemonRef, before: readonly ScriptEvent[]): boolean {
  for (const event of before) {
    if (event.kind === 'singleMove' && sameMon(event.who, who))
      return toID(event.effect.name) === RAGE
    if (event.kind === 'move' && sameMon(event.user, who)) return false
    if (event.kind === 'switchIn' && sameMon(event.who, who)) return false
  }
  return false
}

/** Whether a stat change is a hit's raise of the Attack of a Pokémon in a rage. */
export function buildsRage(event: EventOf<'statChange'>, ctx: Context): boolean {
  const { who, stat, stages, cause } = event
  if (stat !== 'atk' || stages <= 0) return false
  if (cause !== undefined) return toID(cause.name) === RAGE
  const before = ctx.script.events.slice(0, ctx.at).toReversed()
  const move = before.findIndex((earlier) => earlier.kind === 'move')
  const hit = before.slice(0, move).some((earlier) => isHitOn(earlier, who))
  return stages === 1 && move >= 0 && hit && inRage(who, before.slice(move))
}
