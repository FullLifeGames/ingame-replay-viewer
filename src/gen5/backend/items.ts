// The server's sequences of a held item (#109, lane plan D12): a Sitrus Berry and a Custap Berry
// eaten, Life Orb's recoil, an Air Balloon's line as its holder comes in and its pop, and the item
// Knock Off takes, each in the order pokebw2's src/battle/btl_server_flow.c and
// src/battle/handler/item_handlers.c put it into the queue. Leftovers stays with hits.ts. A berry
// eaten is two lines in the log: the `[eat]` line writes SC_USE_HELD_ITEM, which
// ServerControl_UseHeldItem reserves before the handler runs, and the heal or the `[consumed]`
// line after it writes the handler's commands and the item's change. ServerControl_ChangeHeldItem
// also sets a condition flag (scPut_SetContFlag) as an item goes, and a turn flag
// (ServerDisplay_SetTurnFlag) as one is consumed; the client's view never reads either, so the
// sequences leave both out (D8). Pure: every number of the game comes in from build/gen5/bw2.json.
import type { ServerCommand } from '../server-cmd.ts'
import type { InPlace } from './battle-state.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import { type EffectScene, message, recoverHp, type Sequences, simpleHp } from './effect-scene.ts'
import { gen5, gen5Item } from './names.ts'
import type { EventOf } from './rules.ts'

/** The berries whose use has a sequence here, by @pkmn's Gen 5 item ID. */
const BERRIES = new Set(['sitrusberry', 'custapberry'])

const itemId = (name: string | undefined) =>
  name === undefined ? undefined : gen5.items.get(name)?.id

/** ITEM_NONE: what a Pokémon holds once its item is gone. HandlerAirBalloonDamageReaction
 * names it; HandlerKnockOff and ServerControl_UseHeldItem write its literal. */
function noItem(scene: EffectScene): number {
  const none = scene.numbers.pkm.items.ITEM_NONE
  if (none === undefined) throw new Error('bw2.json has no ITEM_NONE')
  return none
}

/** ServerControl_ChangeHeldItem to none: SC_OP_SET_ITEM, and for an item used up
 * SC_OP_CONSUME_ITEM with the item it held. */
function itemGone(scene: EffectScene, monId: number, consumed?: number): ServerCommand[] {
  const set = { command: 'SC_OP_SET_ITEM', args: [monId, noItem(scene)] }
  return consumed === undefined
    ? [set]
    : [set, { command: 'SC_OP_CONSUME_ITEM', args: [monId, consumed] }]
}

/** HandlerKnockOff through BattleHandler_SetItem: the line with the attacker, the target and the
 * item, then the target's item to none. */
function knockedOff(scene: EffectScene, event: EventOf<'itemEnd'>, who: InPlace) {
  const attacker = event.source && scene.state.inPlace(event.source)
  const knockOff =
    event.cause?.kind === 'move' && gen5.moves.get(event.cause.name)?.id === 'knockoff'
  if (!knockOff || attacker === undefined) return undefined
  const args = [attacker.monId, who.monId, gen5Item(event.item)]
  return [message(scene, LINES.knockedOff, args), ...itemGone(scene, who.monId)]
}

/** An item's end:
 * - a Sitrus or Custap Berry eaten: SC_USE_HELD_ITEM, reserved by ServerControl_UseHeldItem;
 * - an Air Balloon popped (HandlerAirBalloonDamageReaction through BattleHandler_SetItem): the
 *   line, then the item to none;
 * - Knock Off's (`knockedOff`). */
function itemEnd(scene: EffectScene, event: EventOf<'itemEnd'>): ServerCommand[] | undefined {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || event.silent === true) return undefined
  const item = itemId(event.item) ?? ''
  if (event.eaten === true) {
    return BERRIES.has(item) ? [{ command: 'SC_USE_HELD_ITEM', args: [who.monId] }] : undefined
  }
  if (event.cause !== undefined) return knockedOff(scene, event, who)
  if (item !== 'airballoon') return undefined
  return [message(scene, LINES.airBalloonPopped, [who.monId]), ...itemGone(scene, who.monId)]
}

/** HandlerSitrusBerryUse through BattleHandler_RecoverHP: ServerControl_RecoverHPCore's effect,
 * HP and gauge, the handler's line, then the berry used up. */
function sitrusBerry(scene: EffectScene, event: EventOf<'heal'>, who: InPlace, name: string) {
  const berry = gen5Item(name)
  return [
    ...recoverHp(scene, event.who, event.hp, who),
    message(scene, LINES.sitrusBerry, [who.monId, berry]),
    ...itemGone(scene, who.monId, berry),
  ]
}

/** HandlerCustapBerryUse through BattleHandler_Message: the line, then the berry used up. */
function custapBerry(scene: EffectScene, event: EventOf<'effectActivate'>) {
  const who = event.who && scene.state.inPlace(event.who)
  const custap = event.consumed === true && itemId(event.effect.name) === 'custapberry'
  if (who === undefined || !custap) return undefined
  const berry = gen5Item(event.effect.name)
  return [
    message(scene, LINES.custapBerry, [who.monId, berry]),
    ...itemGone(scene, who.monId, berry),
  ]
}

/** HandlerLifeOrbReaction through BattleHandler_Damage and ServerControl_SimpleDamageCore: HP and
 * gauge, then the handler's line. */
function lifeOrb(scene: EffectScene, event: EventOf<'damage'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || event.cause?.kind !== 'item') return undefined
  if (itemId(event.cause.name) !== 'lifeorb') return undefined
  return [
    ...simpleHp(scene, event.who, event.hp, who.monId),
    message(scene, LINES.lifeOrb, [who.monId]),
  ]
}

/** HandlerAirBalloonMemberIn through BattleHandler_Message: the line as its holder comes in. An
 * item the log reveals by a move or an ability has no sequence here. */
function airBalloon(scene: EffectScene, event: EventOf<'item'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || event.cause !== undefined || itemId(event.item) !== 'airballoon') {
    return undefined
  }
  return [message(scene, LINES.airBalloon, [who.monId])]
}

/** The held items' sequences by the kind of event they write. */
export const ITEM_SEQUENCES = {
  itemEnd,
  heal: (scene, event) => {
    const who = scene.state.inPlace(event.who)
    const name = event.cause?.kind === 'item' ? event.cause.name : undefined
    return who && itemId(name) === 'sitrusberry'
      ? sitrusBerry(scene, event, who, name ?? '')
      : undefined
  },
  effectActivate: custapBerry,
  damage: lifeOrb,
  item: airBalloon,
} as const satisfies Sequences
