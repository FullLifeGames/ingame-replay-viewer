// Where a battle script's Pokémon sits in Black 2's battle (#106): its party slot, the park's side
// of its side, its side's client, and the mon ID by which the battle's commands name it. Pure: the
// clients and mon IDs come from build/gen5/bw2.json's `battle`, the mon IDs by the rule of
// GetClientIDFromMonID.
import type { BattleScript } from '../../script/events.ts'
import type { PokemonRef, Side } from '../../script/types.ts'
import type { MonIds, SingleBattle } from '../bw2-numbers.ts'
import type { PartySides } from '../direct-party.ts'

/** Each side's team indices in party order. The game sends out slot 0 first, so the members
 * that switch in come first, in the order of their first switch-in, the lead in slot 0; the rest
 * follow in team order. A log with Team Preview orders the team as the preview does (@pkmn/client
 * keeps it so), so a team index is no party slot. */
export function partyOrder(
  script: Pick<BattleScript, 'teams' | 'events'>,
): Readonly<Record<Side, readonly number[]>> {
  const order = (side: Side) => {
    const sent = script.events.flatMap((event) =>
      event.kind === 'switchIn' && event.who.side === side ? [event.who.index] : [],
    )
    const rest = script.teams[side].map((_, index) => index)
    return [...new Set([...sent, ...rest])]
  }
  return { near: order('near'), far: order('far') }
}

/** The key of a battle script's Pokémon, the same for each ref to it: its side and team index. */
export const refKey = (ref: PokemonRef): string => `${ref.side} ${String(ref.index)}`

/** The party slot of a Pokémon in the party order of `partyOrder`. */
export function partySlot(
  order: Readonly<Record<Side, readonly number[]>>,
  ref: PokemonRef,
): number {
  const slot = order[ref.side].indexOf(ref.index)
  if (slot === -1) throw new Error(`no ${ref.side} Pokémon ${String(ref.index)} in the party`)
  return slot
}

/** The park's side of each battle script's side: the near side is the player's. */
export const PARK_SIDES: Readonly<Record<Side, keyof PartySides>> = {
  near: 'player',
  far: 'opponent',
}

/** A value for each of the park's sides, from the battle script's side it stands for. */
export function byParkSide<T>(of: (side: Side) => T): Record<keyof PartySides, T> {
  const sides = { [PARK_SIDES.near]: of('near'), [PARK_SIDES.far]: of('far') }
  return sides as Record<keyof PartySides, T>
}

/** The battle client of `side`: the near side is the player's client and the far side the
 * opponent's, as the single battle's setup creates them (build/gen5/bw2.json). */
export function clientOf(single: SingleBattle, side: Side): number {
  return side === 'near' ? single.clients.player : single.clients.opponent
}

/** The mon ID of `slot` in `client`'s party at the battle's start: the client's first mon ID
 * plus the slot (PokeCon_CreateClientParty). */
export function monIdOf(monIds: MonIds, client: number, slot: number): number {
  const first = monIds.firstByClient[client]
  if (first === undefined) throw new Error(`the battle has no client ${String(client)}`)
  if (!Number.isInteger(slot) || slot < 0 || slot >= monIds.perClient) {
    const room = `client ${String(client)}’s ${String(monIds.perClient)} mon IDs`
    throw new Error(`slot ${String(slot)} lies outside ${room}`)
  }
  return first + slot
}
