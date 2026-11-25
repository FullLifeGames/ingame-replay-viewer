// Phrases for HP changes with a cause (plan §5): damage from weather, hazards, status, recoil,
// items and abilities, and healing. A move's own damage has no line of its own.
import { Dex, toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import {
  abilityName,
  held,
  itemName,
  type Mon,
  moveName,
  nameAtStart,
  nameInside,
  ownerAtStart,
} from './names'
import { ownPhrase, type Phrase, tagged } from './template'

export const HP_TEMPLATES = {
  sandstorm: tagged('STRINGID_PKMNBUFFETEDBYSANDSTORM', (who: Mon) => {
    return `${nameAtStart(who)} is buffeted by the sandstorm!`
  }),
  hail: tagged('STRINGID_PKMNPELTEDBYHAIL', (who: Mon) => {
    return `${nameAtStart(who)} is buffeted by the hail!`
  }),
  spikes: tagged('STRINGID_PKMNHURTBYSPIKES', (who: Mon) => {
    return `${nameAtStart(who)} was hurt by the spikes!`
  }),
  stealthRock: tagged('STRINGID_STEALTHROCKDMG', (who: Mon) => {
    return `Pointed stones dug into ${nameInside(who)}!`
  }),
  poison: tagged('STRINGID_PKMNHURTBYPOISON', (who: Mon) => {
    return `${nameAtStart(who)} was hurt by its poisoning!`
  }),
  burn: tagged(
    'STRINGID_PKMNHURTBYBURN',
    (who: Mon) => `${nameAtStart(who)} was hurt by its burn!`,
  ),
  recoil: tagged('STRINGID_PKMNHITWITHRECOIL', (who: Mon) => {
    return `${nameAtStart(who)} was damaged by the recoil!`
  }),
  leechSeed: tagged('STRINGID_PKMNSAPPEDBYLEECHSEED', (who: Mon) => {
    return `${ownerAtStart(who)} health is sapped by Leech Seed!`
  }),
  confusion: tagged('STRINGID_ITHURTCONFUSION', () => 'It hurt itself in its confusion!'),
  curse: tagged('STRINGID_PKMNAFFLICTEDBYCURSE', (who: Mon) => {
    return `${nameAtStart(who)} is afflicted by the curse!`
  }),
  nightmare: tagged('STRINGID_PKMNLOCKEDINNIGHTMARE', (who: Mon) => {
    return `${nameAtStart(who)} is locked in a nightmare!`
  }),
  trapped: tagged('STRINGID_PKMNHURTBY', (who: Mon, move: string) => {
    return `${nameAtStart(who)} is hurt by ${move}!`
  }),
  item: tagged('STRINGID_HURTBYITEM', (who: Mon, item: string) => {
    return `${nameAtStart(who)} was hurt by the ${item}!`
  }),
  ability: tagged('STRINGID_PKMNHURTSWITH', (who: Mon, holder: Mon, ability: string) => {
    return `${nameAtStart(who)} was hurt by ${nameInside(holder)}'s ${ability}!`
  }),
  regained: tagged(
    'STRINGID_PKMNREGAINEDHEALTH',
    (who: Mon) => `${ownerAtStart(who)} HP was restored.`,
  ),
  leftovers: tagged('STRINGID_PKMNSITEMRESTOREDHPALITTLE', (who: Mon, item: string) => {
    return `${nameAtStart(who)} restored a little HP using its ${item}!`
  }),
  drained: tagged('STRINGID_PKMNENERGYDRAINED', (target: Mon) => {
    return `${nameAtStart(target)} had its energy drained!`
  }),
  abilityHeal: tagged('STRINGID_PKMNRESTOREDHPUSING', (who: Mon) => {
    return `${nameAtStart(who)} had its HP restored.`
  }),
  wish: tagged(
    'STRINGID_PKMNWISHCAMETRUE',
    (wisher: Mon) => `${ownerAtStart(wisher)} wish came true!`,
  ),
  sharedPain: tagged('STRINGID_SHAREDPAIN', () => 'The battlers shared their pain!'),
}

/** Causes whose line names the damaged Pokémon alone, by the effect's id. */
const HURT_BY: Readonly<Record<string, (who: Mon) => string>> = {
  sandstorm: HP_TEMPLATES.sandstorm.render,
  hail: HP_TEMPLATES.hail.render,
  spikes: HP_TEMPLATES.spikes.render,
  stealthrock: HP_TEMPLATES.stealthRock.render,
  psn: HP_TEMPLATES.poison.render,
  tox: HP_TEMPLATES.poison.render,
  brn: HP_TEMPLATES.burn.render,
  recoil: HP_TEMPLATES.recoil.render,
  leechseed: HP_TEMPLATES.leechSeed.render,
  confusion: HP_TEMPLATES.confusion.render,
  curse: HP_TEMPLATES.curse.render,
  nightmare: HP_TEMPLATES.nightmare.render,
}

/** Wrap, Fire Spin and the other moves that trap and hurt each turn, by @pkmn's data. */
export const isTrapping = (name: string) =>
  Dex.moves.get(name).volatileStatus === 'partiallytrapped'

function hurtByKind(who: Mon, cause: Effect, source: Mon | undefined): string | undefined {
  if (cause.kind === 'item') return HP_TEMPLATES.item.render(who, itemName(cause.name))
  if (cause.kind === 'ability' && source !== undefined) {
    return HP_TEMPLATES.ability.render(who, source, abilityName(cause.name))
  }
  if (isTrapping(cause.name)) return HP_TEMPLATES.trapped.render(who, moveName(cause.name))
  return undefined
}

/** Damage the log names a cause for; `source` is the Pokémon of `[of]`. */
export function hurt(who: Mon, cause: Effect, source: Mon | undefined): Phrase {
  const text = HURT_BY[toID(cause.name)]?.(who) ?? hurtByKind(who, cause, source)
  if (text !== undefined) return { text }
  const own = `${nameAtStart(who)} was hurt by ${held(cause.name)}!`
  return ownPhrase(own, `damage from ${cause.name}`)
}

/**
 * A heal: by an item, by draining `source`, by an ability, or else plain. Wish prints
 * `wishCameTrue` first and then this line, as the game does.
 */
export function healed(who: Mon, cause: Effect | undefined, source: Mon | undefined): string {
  if (cause?.kind === 'item') return HP_TEMPLATES.leftovers.render(who, itemName(cause.name))
  if (cause?.kind === 'ability') return HP_TEMPLATES.abilityHeal.render(who)
  if (cause?.name === 'drain' && source !== undefined) return HP_TEMPLATES.drained.render(source)
  return HP_TEMPLATES.regained.render(who)
}

export const wishCameTrue = (wisher: Mon) => HP_TEMPLATES.wish.render(wisher)

/** The line of HP set outright: Pain Split's, or none for HP set any other way. */
export const hpSet = (cause: Effect | undefined) =>
  cause !== undefined && toID(cause.name) === 'painsplit'
    ? HP_TEMPLATES.sharedPain.render()
    : undefined
