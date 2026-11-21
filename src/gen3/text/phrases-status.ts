// Phrases for status conditions (plan §5): a status given or cured, a whole team cured, and a
// Pokémon that cannot move.
import type { StatusName } from '@pkmn/data'
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { itemName, type Mon, moveName, nameAtStart, ownerAtStart } from './names'
import { ownPhrase, type Phrase, tagged } from './template'

type Line = (who: Mon) => string
type ItemLine = (who: Mon, item: string) => string

const start =
  (rest: string): Line =>
  (who) =>
    `${nameAtStart(who)} ${rest}`
const withItem =
  (rest: string): ItemLine =>
  (who, item) =>
    `${ownerAtStart(who)} ${item} ${rest}`

export const STATUS_TEMPLATES = {
  fellAsleep: tagged('STRINGID_PKMNFELLASLEEP', start('fell asleep!')),
  poisoned: tagged('STRINGID_PKMNWASPOISONED', start('was poisoned!')),
  badlyPoisoned: tagged('STRINGID_PKMNBADLYPOISONED', start('was badly poisoned!')),
  burned: tagged('STRINGID_PKMNWASBURNED', start('was burned!')),
  frozen: tagged('STRINGID_PKMNWASFROZEN', start('was frozen solid!')),
  paralyzed: tagged(
    'STRINGID_PKMNWASPARALYZED',
    start('is paralyzed, so it may be unable to move!'),
  ),
  wentToSleep: tagged('STRINGID_PKMNWENTTOSLEEP', start('went to sleep!')),
  sleptHealthy: tagged('STRINGID_PKMNSLEPTHEALTHY', start('slept and restored its HP!')),
  wokeUp: tagged('STRINGID_PKMNWOKEUP', start('woke up!')),
  thawed: tagged('STRINGID_PKMNWASDEFROSTED', start('thawed out!')),
  curedParalysis: tagged('STRINGID_PKMNHEALEDPARALYSIS', start('was cured of paralysis!')),
  curedPoison: tagged('STRINGID_PKMNHEALEDPOISON', start('was cured of its poisoning!')),
  curedBurn: tagged(
    'STRINGID_PKMNBURNHEALED',
    (who: Mon) => `${ownerAtStart(who)} burn was cured!`,
  ),
  itemParalysis: tagged('STRINGID_PKMNSITEMCUREDPARALYSIS', withItem('cured its paralysis!')),
  itemPoison: tagged('STRINGID_PKMNSITEMCUREDPOISON', withItem('cured its poison!')),
  itemBurn: tagged('STRINGID_PKMNSITEMHEALEDBURN', withItem('cured its burn!')),
  itemFreeze: tagged('STRINGID_PKMNSITEMDEFROSTEDIT', withItem('defrosted it!')),
  itemSleep: tagged('STRINGID_PKMNSITEMWOKEIT', withItem('woke it up!')),
  aroma: tagged('STRINGID_SOOTHINGAROMA', () => 'A soothing aroma wafted through the area!'),
  bell: tagged('STRINGID_BELLCHIMED', () => 'A bell chimed!'),
}

export const CANT_TEMPLATES = {
  asleep: tagged('STRINGID_PKMNFASTASLEEP', start('is fast asleep.')),
  frozen: tagged('STRINGID_PKMNISFROZEN', start('is frozen solid!')),
  paralyzed: tagged('STRINGID_PKMNISPARALYZED', start("couldn't move because it's paralyzed!")),
  flinched: tagged('STRINGID_PKMNFLINCHED', start("flinched and couldn't move!")),
  recharge: tagged('STRINGID_PKMNMUSTRECHARGE', start('must recharge!')),
  lostFocus: tagged('STRINGID_PKMNLOSTFOCUS', start("lost its focus and couldn't move!")),
  love: tagged('STRINGID_PKMNIMMOBILIZEDBYLOVE', start('is immobilized by love!')),
  loafing: tagged('STRINGID_PKMNLOAFING', start('is loafing around!')),
  taunt: tagged('STRINGID_PKMNCANTUSEMOVETAUNT', (who: Mon, move: string) => {
    return `${nameAtStart(who)} can't use ${move} after the taunt!`
  }),
  disabled: tagged('STRINGID_PKMNMOVEISDISABLED', (who: Mon, move: string) => {
    return `${ownerAtStart(who)} ${move} is disabled!`
  }),
}

const GIVEN: Readonly<Record<StatusName, Line>> = {
  slp: STATUS_TEMPLATES.fellAsleep.render,
  psn: STATUS_TEMPLATES.poisoned.render,
  tox: STATUS_TEMPLATES.badlyPoisoned.render,
  brn: STATUS_TEMPLATES.burned.render,
  frz: STATUS_TEMPLATES.frozen.render,
  par: STATUS_TEMPLATES.paralyzed.render,
}

const CURED: Readonly<Record<StatusName, Line>> = {
  slp: STATUS_TEMPLATES.wokeUp.render,
  frz: STATUS_TEMPLATES.thawed.render,
  par: STATUS_TEMPLATES.curedParalysis.render,
  psn: STATUS_TEMPLATES.curedPoison.render,
  tox: STATUS_TEMPLATES.curedPoison.render,
  brn: STATUS_TEMPLATES.curedBurn.render,
}

const ITEM_CURED: Readonly<Record<StatusName, ItemLine>> = {
  slp: STATUS_TEMPLATES.itemSleep.render,
  frz: STATUS_TEMPLATES.itemFreeze.render,
  par: STATUS_TEMPLATES.itemParalysis.render,
  psn: STATUS_TEMPLATES.itemPoison.render,
  tox: STATUS_TEMPLATES.itemPoison.render,
  brn: STATUS_TEMPLATES.itemBurn.render,
}

/** A status a move, an ability or a hazard gave; Rest has `rested`. */
export const statusGiven = (who: Mon, status: StatusName) => GIVEN[status](who)

/** Rest: the game says more when Rest replaced another status. */
export function rested(who: Mon, hadStatus: boolean): string {
  return (hadStatus ? STATUS_TEMPLATES.sleptHealthy : STATUS_TEMPLATES.wentToSleep).render(who)
}

export const statusCured = (who: Mon, status: StatusName) => CURED[status](who)

/** A held item, such as Lum Berry, that cured the status. */
export function itemCured(who: Mon, item: string, status: StatusName): string {
  return ITEM_CURED[status](who, itemName(item))
}

const TEAM_CURES: Readonly<Record<string, () => string>> = {
  aromatherapy: STATUS_TEMPLATES.aroma.render,
  healbell: STATUS_TEMPLATES.bell.render,
}

export function teamCured(who: Mon, cause: Effect | undefined): Phrase {
  const text = cause && TEAM_CURES[toID(cause.name)]?.()
  if (text !== undefined) return { text }
  const by = cause === undefined ? '' : ` by ${cause.name}`
  return ownPhrase(`${ownerAtStart(who)} team was cured!`, `a team cured${by}`)
}

const CANT: Readonly<Record<string, Line>> = {
  slp: CANT_TEMPLATES.asleep.render,
  frz: CANT_TEMPLATES.frozen.render,
  par: CANT_TEMPLATES.paralyzed.render,
  flinch: CANT_TEMPLATES.flinched.render,
  recharge: CANT_TEMPLATES.recharge.render,
  focuspunch: CANT_TEMPLATES.lostFocus.render,
  attract: CANT_TEMPLATES.love.render,
  truant: CANT_TEMPLATES.loafing.render,
}

const CANT_MOVE: Readonly<Record<string, (who: Mon, move: string) => string>> = {
  taunt: CANT_TEMPLATES.taunt.render,
  disable: CANT_TEMPLATES.disabled.render,
}

/** A Pokémon that cannot move, for the reason the log gives and the move it could not use. */
export function cant(who: Mon, reason: Effect, move: string | undefined): Phrase {
  const id = toID(reason.name)
  const bound = CANT_MOVE[id]
  const text = bound && move !== undefined ? bound(who, moveName(move)) : CANT[id]?.(who)
  if (text !== undefined) return { text }
  const own = `${nameAtStart(who)} couldn't move!`
  return ownPhrase(own, `a Pokémon held back by ${reason.name}`)
}
