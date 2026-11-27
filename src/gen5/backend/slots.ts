// Where a battle script's Pokémon sits in Black 2's battle (#106): its party slot, the park's side
// of its side, and the mon ID by which the battle's commands name it. Pure: the mon IDs come from
// build/gen5/bw2.json's `battle.monIds`, the rule of GetClientIDFromMonID.
import type { PokemonRef, Side } from '../../script/types.ts'
import type { MonIds } from '../bw2-numbers.ts'
import type { PartySides } from '../direct-party.ts'

/** The party slot of a Pokémon: its index in its side's team, which keeps the order of first
 * appearance; the park writes each team in that order. */
export const partySlot = (ref: PokemonRef): number => ref.index

/** The park's side of each battle script's side: the near side is the player's. */
export const PARK_SIDES: Readonly<Record<Side, keyof PartySides>> = {
  near: 'player',
  far: 'opponent',
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
