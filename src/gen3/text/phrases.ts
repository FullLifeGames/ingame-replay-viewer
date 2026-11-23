// Phrases for moves, hits, faints and stat changes (plan §5): each takes the names and values an
// event carries and returns the game's text in Unicode. The backend encodes it for PRINT.
import type { BoostID, StatusName } from '@pkmn/data'
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { Gen3Error } from '../errors'
import { held, type Mon, moveName, nameAtStart, nameInside, ownerAtStart } from './names'
import { ownPhrase, type Phrase, tagged } from './template'

export const MOVE_TEMPLATES = {
  usedMove: tagged('sText_AttackerUsedX', (user: Mon, move: string) => {
    return `${nameAtStart(user)} used ${move}!`
  }),
  avoided: tagged('STRINGID_PKMNAVOIDEDATTACK', (target: Mon) => {
    return `${nameAtStart(target)} avoided the attack!`
  }),
  critical: tagged('STRINGID_CRITICALHIT', () => 'A critical hit!'),
  superEffective: tagged('STRINGID_SUPEREFFECTIVE', () => "It's super effective!"),
  notVeryEffective: tagged('STRINGID_NOTVERYEFFECTIVE', () => "It's not very effective…"),
  // `BattleScript_MultiHitPrintStrings` (data/battle_scripts_1.s); `BS_MultiHitPlurality`
  // (src/battle_script_commands.c) gives B_BUFF2 "" for one hit and "s" for more.
  hitCount: tagged('STRINGID_HITXTIMES', (hits: number) => {
    return `The Pokémon was hit ${String(hits)} time${hits === 1 ? '' : 's'}!`
  }),
  doesntAffect: tagged('STRINGID_ITDOESNTAFFECT', (who: Mon) => {
    return `It doesn't affect ${nameInside(who)}…`
  }),
  // `BattleScript_OwnTempoPrevents` and `BattleScript_SwaggerOwnTempoPrevents`
  // (data/battle_scripts_1.s), with the target as `sBATTLER`.
  cannotBeConfused: tagged('STRINGID_PKMNPREVENTSCONFUSIONWITH', (who: Mon) => {
    return `${nameAtStart(who)} cannot be confused!`
  }),
  failed: tagged('STRINGID_BUTITFAILED', () => 'But it failed!'),
  // B_MSG_SUBSTITUTE_FAILED in `gSubstituteUsedStringIds`; `BattleScript_EffectSubstitute`
  // prints it and skips the animation (data/battle_scripts_1.s).
  substituteWeak: tagged('STRINGID_TOOWEAKFORSUBSTITUTE', () => {
    return 'But it does not have enough HP left to make a substitute!'
  }),
  // `BattleScript_AlreadyHasSubstitute` prints it before the animation (data/battle_scripts_1.s).
  hasSubstitute: tagged('STRINGID_PKMNHASSUBSTITUTE', (who: Mon) => {
    return `${nameAtStart(who)} already has a substitute!`
  }),
  alreadyAsleep: tagged('STRINGID_PKMNALREADYASLEEP', (who: Mon) => {
    return `${nameAtStart(who)} is already asleep!`
  }),
  alreadyPoisoned: tagged('STRINGID_PKMNALREADYPOISONED', (who: Mon) => {
    return `${nameAtStart(who)} is already poisoned!`
  }),
  alreadyParalyzed: tagged('STRINGID_PKMNISALREADYPARALYZED', (who: Mon) => {
    return `${nameAtStart(who)} is already paralyzed!`
  }),
  alreadyBurned: tagged('STRINGID_PKMNALREADYHASBURN', (who: Mon) => {
    return `${nameAtStart(who)} is already burned!`
  }),
  statsNotLowered: tagged('STRINGID_PKMNPREVENTSSTATLOSSWITH', (who: Mon) => {
    return `${ownerAtStart(who)} stats were not lowered!`
  }),
  fainted: tagged('STRINGID_BATTLERFAINTED', (who: Mon) => `${nameAtStart(who)} fainted!`),
}

export const STAT_TEMPLATES = {
  atk: tagged('sText_Attack', () => 'Attack'),
  def: tagged('sText_Defense', () => 'Defense'),
  spa: tagged('sText_SpAttack', () => 'Sp. Atk'),
  spd: tagged('sText_SpDefense', () => 'Sp. Def'),
  spe: tagged('sText_Speed', () => 'Speed'),
  accuracy: tagged('sText_Accuracy', () => 'accuracy'),
  evasion: tagged('sText_Evasiveness', () => 'evasiveness'),
  sharply: tagged('gText_StatSharply', () => ' sharply'),
  drastically: tagged('gText_drastically', () => ' drastically'),
  harshly: tagged('STRINGID_STATHARSHLY', () => 'harshly '),
  severely: tagged('gText_severely', () => 'severely '),
  rose: tagged('STRINGID_STATROSE', (who: Mon, stat: string, how: string) => {
    return `${ownerAtStart(who)} ${stat} rose${how}!`
  }),
  fell: tagged('STRINGID_STATFELL', (who: Mon, stat: string, how: string) => {
    return `${ownerAtStart(who)} ${stat} ${how}fell!`
  }),
  wontRise: tagged('STRINGID_STATSWONTINCREASE', (who: Mon, stat: string) => {
    return `${ownerAtStart(who)} ${stat} won't go any higher!`
  }),
  wontFall: tagged('STRINGID_STATSWONTDECREASE', (who: Mon, stat: string) => {
    return `${ownerAtStart(who)} ${stat} won't go any lower!`
  }),
  // B_MSG_STAT_CHANGED_BELLY_DRUM: `ChangeStatBuffs` (src/battle_stat_change.c) picks it for
  // EFFECT_BELLY_DRUM in place of the "rose" line.
  maxedAttack: tagged('STRINGID_PKMNCUTHPMAXEDATTACK', (who: Mon) => {
    return `${nameAtStart(who)} cut its own HP and maximized its Attack!`
  }),
}

export function usedMove(user: Mon, move: string): string {
  return MOVE_TEMPLATES.usedMove.render(user, moveName(move))
}

/** The game has no "missed" line: the target avoids the attack. Without one, ours stands in. */
export function missed(user: Mon, target: Mon | undefined): Phrase {
  if (target !== undefined) return { text: MOVE_TEMPLATES.avoided.render(target) }
  return ownPhrase(`${ownerAtStart(user)} attack missed!`, 'a miss without a target')
}

export const critical = () => MOVE_TEMPLATES.critical.render()

export function effective(effectiveness: 'super' | 'resisted'): string {
  const template = effectiveness === 'super' ? 'superEffective' : 'notVeryEffective'
  return MOVE_TEMPLATES[template].render()
}

/** The count line after a multi-hit move's last hit. */
export const hitCount = (hits: number) => MOVE_TEMPLATES.hitCount.render(hits)

/** An immunity the log names confusion for has its own line (Own Tempo's); any other has none. */
export function immune(who: Mon, effect?: Effect): string {
  if (effect && toID(effect.name) === 'confusion')
    return MOVE_TEMPLATES.cannotBeConfused.render(who)
  return MOVE_TEMPLATES.doesntAffect.render(who)
}

/** Keyed by the effect's id: a status, `unboost`, or a move such as `move: Substitute`. */
const ALREADY: Partial<Record<StatusName | 'unboost' | 'substitute', (who: Mon) => string>> = {
  slp: MOVE_TEMPLATES.alreadyAsleep.render,
  psn: MOVE_TEMPLATES.alreadyPoisoned.render,
  tox: MOVE_TEMPLATES.alreadyPoisoned.render,
  par: MOVE_TEMPLATES.alreadyParalyzed.render,
  brn: MOVE_TEMPLATES.alreadyBurned.render,
  unboost: MOVE_TEMPLATES.statsNotLowered.render,
  substitute: MOVE_TEMPLATES.hasSubstitute.render,
}

/**
 * A failure the log names a status, `unboost` or a Substitute already up for has its own line,
 * and so has one for too little HP (`weak`, Substitute's); any other fails.
 */
export function failed(who: Mon, effect: Effect | undefined, weak?: true): string {
  if (weak) return MOVE_TEMPLATES.substituteWeak.render()
  const own = effect && ALREADY[toID(effect.name) as keyof typeof ALREADY]
  return own ? own(who) : MOVE_TEMPLATES.failed.render()
}

export const fainted = (who: Mon) => MOVE_TEMPLATES.fainted.render(who)

const statName = (stat: BoostID) => held(STAT_TEMPLATES[stat].render())

const RISES = ['', STAT_TEMPLATES.sharply.render(), STAT_TEMPLATES.drastically.render()]
const FALLS = ['', STAT_TEMPLATES.harshly.render(), STAT_TEMPLATES.severely.render()]

/**
 * "rose", "rose sharply", "rose drastically" for 1, 2, 3 or more stages; the same for falls.
 * Belly Drum's change, by its `cause`, says the maxed Attack instead.
 */
export function statChanged(who: Mon, stat: BoostID, stages: number, cause?: Effect): string {
  if (cause !== undefined && toID(cause.name) === 'bellydrum')
    return STAT_TEMPLATES.maxedAttack.render(who)
  if (stages === 0)
    throw new Gen3Error(`a change of 0 stages has no direction; ${stat} of ${who.name}`)
  const words = stages > 0 ? RISES : FALLS
  const how = held(words[Math.min(Math.abs(stages), words.length) - 1] ?? '')
  const template = stages > 0 ? STAT_TEMPLATES.rose : STAT_TEMPLATES.fell
  return template.render(who, statName(stat), how)
}

export function statWontChange(who: Mon, stat: BoostID, direction: 'up' | 'down'): string {
  const template = direction === 'up' ? STAT_TEMPLATES.wontRise : STAT_TEMPLATES.wontFall
  return template.render(who, statName(stat))
}
