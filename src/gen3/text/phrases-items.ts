// Phrases for held items and abilities (plan §5). The expansion shows an ability by its pop-up,
// so most abilities have no line of their own.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { itemName, type Mon, nameAtStart, nameInside, ownerAtStart } from './names'
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
  pressure: tagged('STRINGID_PRESSUREENTERS', (who: Mon) => {
    return `${nameAtStart(who)} is exerting its pressure!`
  }),
}

const STEALS = new Set(['thief', 'covet'])

/** An item `who` now holds or shows; `source` is the Pokémon it came from. */
export function itemShown(
  who: Mon,
  item: string,
  cause: Effect | undefined,
  source: Mon | undefined,
): Phrase {
  const id = cause && toID(cause.name)
  const name = itemName(item)
  if (id !== undefined && STEALS.has(id) && source !== undefined) {
    return { text: ITEM_TEMPLATES.stole.render(who, source, name) }
  }
  if (id === 'trick') return { text: ITEM_TEMPLATES.obtained.render(who, name) }
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
  return ownPhrase(`${ownerAtStart(who)} ${name} was used up!`, `${item} used up`)
}

/** The line an ability adds to its pop-up, if it has one. */
export function abilityShown(who: Mon, ability: string): string | undefined {
  return toID(ability) === 'pressure' ? ITEM_TEMPLATES.pressure.render(who) : undefined
}
