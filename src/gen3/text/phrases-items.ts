// Phrases for held items and abilities (plan §5). The expansion shows an ability by its pop-up,
// so most abilities have no line of their own.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { abilityName, itemName, type Mon, nameAtStart, nameInside, ownerAtStart } from './names'
import { ownPhrase, type Phrase, tagged } from './template'

export const ITEM_TEMPLATES = {
  stole: tagged('STRINGID_PKMNSTOLEITEM', (thief: Mon, victim: Mon, item: string) => {
    return `${nameAtStart(thief)} stole ${nameInside(victim)}'s ${item}!`
  }),
  obtained: tagged('STRINGID_PKMNOBTAINEDX', (who: Mon, item: string) => {
    return `${nameAtStart(who)} obtained ${item}.`
  }),
  knockedOff: tagged('STRINGID_PKMNKNOCKEDOFF', (user: Mon, target: Mon, item: string) => {
    return `${nameAtStart(user)} knocked off ${nameInside(target)}'s ${item}!`
  }),
  airBalloon: tagged('STRINGID_AIRBALLOONFLOAT', (who: Mon) => {
    return `${nameAtStart(who)} floats in the air with its Air Balloon!`
  }),
  airBalloonPopped: tagged('STRINGID_AIRBALLOONPOP', (who: Mon) => {
    return `${nameAtStart(who)}'s Air Balloon popped!`
  }),
  actsFaster: tagged('STRINGID_CANACTFASTERTHANKSTO', (who: Mon, item: string) => {
    return `${nameAtStart(who)} can act faster than normal, thanks to its ${item}!`
  }),
  hungOn: tagged('STRINGID_PKMNHUNGONWITHX', (who: Mon, item: string) => {
    return `${nameAtStart(who)} hung on using its ${item}!`
  }),
  // `BattleScript_BerryReduceDmg`, after the hit that the berry weakened.
  berryWeakened: tagged('STRINGID_BERRYDMGREDUCES', (who: Mon, item: string) => {
    return `${nameAtStart(who)}'s ${item} lessened the damage it took!`
  }),
  whiteHerb: tagged('STRINGID_PKMNSITEMRESTOREDSTATUS', (who: Mon, item: string) => {
    return `${nameAtStart(who)} returned its stats to normal using its ${item}!`
  }),
  pressure: tagged('STRINGID_PRESSUREENTERS', (who: Mon) => {
    return `${nameAtStart(who)} is exerting its pressure!`
  }),
  // B_MSG_SWITCHIN_NEUTRALIZING_GAS in `gSwitchInAbilityStringIds`, inside the pop-up.
  neutralizingGas: tagged('STRINGID_NEUTRALIZINGGASENTERS', () => {
    return 'Neutralizing gas filled the area!'
  }),
}

const STEALS = new Set(['thief', 'covet'])

/** Trick and Switcheroo (EFFECT_TRICK) say each item by `gItemSwapStringIds`. */
const SWAPS = new Set(['trick', 'switcheroo'])

/** Whether `item` is Focus Sash, which says its holder hung on (`BattleScript_HangedOnMsg`). */
export const hangsOn = (item: string) => toID(item) === 'focussash'

/**
 * The Air Balloon says its lines with no pop-up: as its holder comes in, and as a hit pops it
 * (`BattleScript_AirBalloonMsgInRet`, `BattleScript_AirBalloonMsgPop`). The log gives both with
 * no cause.
 */
const AIR_BALLOON = 'airballoon'

/** Thief and Covet take the item of the Pokémon of `[of]`. */
export const isSteal = (cause: Effect | undefined) =>
  cause !== undefined && STEALS.has(toID(cause.name))

/** An item `who` now holds or shows; `source` is the Pokémon it came from. */
export function itemShown(
  who: Mon,
  item: string,
  cause: Effect | undefined,
  source: Mon | undefined,
): Phrase {
  const id = cause && toID(cause.name)
  const name = itemName(item)
  if (isSteal(cause) && source !== undefined) {
    return { text: ITEM_TEMPLATES.stole.render(who, source, name) }
  }
  if (id !== undefined && SWAPS.has(id)) return { text: ITEM_TEMPLATES.obtained.render(who, name) }
  if (cause === undefined && toID(item) === AIR_BALLOON) {
    return { text: ITEM_TEMPLATES.airBalloon.render(who) }
  }
  const by = cause === undefined ? '' : ` by ${cause.name}`
  return ownPhrase(`${ownerAtStart(who)} ${name} was revealed!`, `an item shown${by}`)
}

/** An item gone from `who` other than a berry eaten (its cure says it) or a silent end. */
export function itemRemoved(
  who: Mon,
  item: string,
  cause: Effect | undefined,
  source: Mon | undefined,
): Phrase {
  const name = itemName(item)
  if (cause && toID(cause.name) === 'knockoff' && source !== undefined) {
    return { text: ITEM_TEMPLATES.knockedOff.render(source, who, name) }
  }
  if (cause === undefined && toID(item) === AIR_BALLOON) {
    return { text: ITEM_TEMPLATES.airBalloonPopped.render(who) }
  }
  if (cause === undefined && hangsOn(item)) {
    return { text: ITEM_TEMPLATES.hungOn.render(who, name) }
  }
  return ownPhrase(`${ownerAtStart(who)} ${name} was used up!`, `${item} used up`)
}

/** The berry `who` ate lessened the damage of the hit on it. */
export const berryWeakened = (who: Mon, item: string): Phrase => ({
  text: ITEM_TEMPLATES.berryWeakened.render(who, itemName(item)),
})

/** The item `who` ate or held let it move first in its priority (Custap Berry, Quick Claw). */
export const actedFaster = (who: Mon, item: string): Phrase => ({
  text: ITEM_TEMPLATES.actsFaster.render(who, itemName(item)),
})

/**
 * Lowered stages back to 0: by the item `who` used up just before (White Herb), or else in a line
 * of ours.
 */
export function loweredStatsReset(who: Mon, item: string | undefined): Phrase {
  if (item !== undefined) return { text: ITEM_TEMPLATES.whiteHerb.render(who, itemName(item)) }
  return ownPhrase(
    `${nameAtStart(who)} returned its lowered stats to normal!`,
    'lowered stats reset',
  )
}

/** The lines abilities add to their pop-ups, by the ability's id. */
const SHOWN: Readonly<Record<string, (who: Mon) => string>> = {
  pressure: ITEM_TEMPLATES.pressure.render,
  neutralizinggas: ITEM_TEMPLATES.neutralizingGas.render,
}

/** The line an ability adds to its pop-up, if it has one. */
export function abilityShown(who: Mon, ability: string): string | undefined {
  return SHOWN[toID(ability)]?.(who)
}

/** An ability the expansion lacks has no pop-up; this line of ours stands in for it. */
export function abilityAsText(who: Mon, ability: string): string {
  return `${ownerAtStart(who)} ${abilityName(ability)} took effect!`
}
