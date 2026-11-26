// Phrases for effects on one Pokémon (plan §5): Substitute, Leech Seed, confusion, the perish
// count, partial traps and the like as they start, act and end, effects for one turn, and blocks.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import {
  held,
  type Mon,
  moveName,
  nameAtStart,
  nameInside,
  ownerAtStart,
  speciesName,
} from './names'
import { FIELD_TEMPLATES, screenRaised } from './phrases-field'
import { isTrapping } from './phrases-hp'
import { STATUS_TEMPLATES } from './phrases-status'
import { ownPhrase, type Phrase, tagged } from './template'

type Line = (who: Mon) => string

const start =
  (rest: string): Line =>
  (who) =>
    `${nameAtStart(who)} ${rest}`

export const EFFECT_TEMPLATES = {
  substitute: tagged('STRINGID_PKMNMADESUBSTITUTE', start('put in a substitute!')),
  seeded: tagged('STRINGID_PKMNSEEDED', start('was seeded!')),
  perish: tagged('STRINGID_PKMNPERISHCOUNTFELL', (who: Mon, count: string) => {
    return `${ownerAtStart(who)} perish count fell to ${count}!`
  }),
  confused: tagged('STRINGID_PKMNWASCONFUSED', start('became confused!')),
  pumped: tagged('gText_PkmnGettingPumped', start('is getting pumped!')),
  taunted: tagged('STRINGID_PKMNFELLFORTAUNT', start('fell for the taunt!')),
  encored: tagged('STRINGID_PKMNGOTENCORE', start('must do an encore!')),
  inLove: tagged('STRINGID_PKMNFELLINLOVE', start('fell in love!')),
  drowsy: tagged('STRINGID_PKMNWASMADEDROWSY', start('grew drowsy!')),
  nightmare: tagged('STRINGID_PKMNFELLINTONIGHTMARE', start('began having a nightmare!')),
  cursed: tagged('STRINGID_PKMNLAIDCURSE', (user: Mon, target: Mon) => {
    return `${nameAtStart(user)} cut its own HP and put a curse on ${nameInside(target)}!`
  }),
  substituteHit: tagged('STRINGID_SUBSTITUTEDAMAGED', (who: Mon) => {
    return `The substitute took damage for ${nameInside(who)}!`
  }),
  nothing: tagged('STRINGID_BUTNOTHINGHAPPENED', () => 'But nothing happened!'),
  isConfused: tagged('STRINGID_PKMNISCONFUSED', start('is confused!')),
  protected: tagged('STRINGID_PKMNPROTECTEDITSELF', start('protected itself!')),
  substituteFaded: tagged('STRINGID_PKMNSUBSTITUTEFADED', (who: Mon) => {
    return `${ownerAtStart(who)} substitute faded!`
  }),
  confusionEnded: tagged('STRINGID_PKMNHEALEDCONFUSION', start('snapped out of its confusion!')),
  seedShed: tagged('STRINGID_PKMNSHEDLEECHSEED', start('was freed from Leech Seed!')),
  encoreEnded: tagged('STRINGID_PKMNENCOREENDED', start('ended its encore!')),
  disableEnded: tagged('STRINGID_PKMNMOVEDISABLEDNOMORE', (who: Mon) => {
    return `${ownerAtStart(who)} move is no longer disabled!`
  }),
  freed: tagged('STRINGID_PKMNFREEDFROM', (who: Mon, move: string) => {
    return `${nameAtStart(who)} was freed from ${move}!`
  }),
  protecting: tagged('STRINGID_PKMNPROTECTEDITSELF2', start('protected itself!')),
  braced: tagged('STRINGID_PKMNBRACEDITSELF', start('braced itself!')),
  focusing: tagged('STRINGID_PKMNTIGHTENINGFOCUS', start('is tightening its focus!')),
  tookFoe: tagged('STRINGID_PKMNTOOKFOE', start('took its attacker down with it!')),
  squeezed: tagged('STRINGID_PKMNSQUEEZEDBYBIND', (who: Mon, trapper: Mon) => {
    return `${nameAtStart(who)} was squeezed by ${nameInside(trapper)}!`
  }),
  wrapped: tagged('STRINGID_PKMNWRAPPEDBY', (who: Mon, trapper: Mon) => {
    return `${nameAtStart(who)} was wrapped by ${nameInside(trapper)}!`
  }),
  vortex: tagged('STRINGID_PKMNTRAPPEDINVORTEX', start('became trapped in the vortex!')),
  clamped: tagged('STRINGID_PKMNCLAMPED', (who: Mon, trapper: Mon) => {
    return `${nameAtStart(trapper)} clamped down on ${nameInside(who)}!`
  }),
  quicksand: tagged('STRINGID_PKMNTRAPPEDBYSANDTOMB', start('became trapped by the quicksand!')),
  // `BattleScript_EffectMeanLook` (data/battle_scripts_1.s), with the target as B_DEF.
  cantEscape: tagged('STRINGID_TARGETCANTESCAPENOW', start('can no longer escape!')),
  // `BattleScript_EffectDisable`, with the target as B_DEF and its move as B_BUFF1.
  disabled: tagged('STRINGID_PKMNMOVEWASDISABLED', (who: Mon, move: string) => {
    return `${ownerAtStart(who)} ${move} was disabled!`
  }),
  // B_MSG_TRANSFORMED in `gTransformUsedStringIds`; B_BUFF1 is the target's species.
  transformed: tagged('STRINGID_PKMNTRANSFORMEDINTO', (who: Mon, species: string) => {
    return `${nameAtStart(who)} transformed into ${species}!`
  }),
  // `BattleScript_BattlerFormChangeWithString`, after the form change (Castform's Forecast).
  formChanged: tagged('STRINGID_PKMNTRANSFORMED', start('transformed!')),
  // Bide's second turn (`BattleScript_BideStoringEnergy`) and its third (`BattleScript_BideAttack`).
  // `BattleScript_Terastallization` says it first too, then the change with B_BUFF1 the type.
  storingEnergy: tagged('STRINGID_PKMNSTORINGENERGY', start('is storing energy!')),
  terastallized: tagged('STRINGID_PKMNTERASTALLIZEDINTO', (who: Mon, type: string) => {
    return `${nameAtStart(who)} terastallized into the ${type} type!`
  }),
  unleashedEnergy: tagged('STRINGID_PKMNUNLEASHEDENERGY', start('unleashed its energy!')),
  // `BattleScript_RageIsBuilding` says it after a hit raises the Attack of a Pokémon in a rage
  // (`rage.ts`); a `-start|<mon>|Rage` line says it as Rage starts.
  rageBuilding: tagged('STRINGID_PKMNRAGEBUILDING', (who: Mon) => {
    return `${ownerAtStart(who)} rage is building!`
  }),
  // B_MSG_FUTURE_SIGHT and B_MSG_DOOM_DESIRE in `gFutureMoveUsedStringIds`; the hit
  // (`BattleScript_MonTookFutureAttack`) names the move as B_BUFF1.
  foresaw: tagged('STRINGID_PKMNFORESAWATTACK', start('foresaw an attack!')),
  choseDestiny: tagged('STRINGID_PKMNCHOSEXASDESTINY', start('chose Doom Desire as its destiny!')),
  tookAttack: tagged('STRINGID_PKMNTOOKATTACK', (who: Mon, move: string) => {
    return `${nameAtStart(who)} took the ${move} attack!`
  }),
  // `BattleScript_EffectDestinyBond` and `BattleScript_EffectGrudge`, with the user as B_ATK.
  hopingToTakeFoe: tagged(
    'STRINGID_PKMNTRYINGTOTAKEFOE',
    start('is hoping to take its attacker down with it!'),
  ),
  grudge: tagged('STRINGID_PKMNWANTSGRUDGE', start('wants its target to bear a grudge!')),
  // `BattleScript_SafeguardProtected`, with the Pokémon Safeguard guards as B_SCR.
  safeguarded: tagged('STRINGID_PKMNUSEDSAFEGUARD', start('is protected by Safeguard!')),
  // `BattleScript_EffectPsychUp`, with the user as B_SCR and the target as B_EFF.
  copiedStats: tagged('STRINGID_PKMNCOPIEDSTATCHANGES', (who: Mon, from: Mon) => {
    return `${nameAtStart(who)} copied ${nameInside(from)}'s stat changes!`
  }),
}

const E = EFFECT_TEMPLATES

const STARTS: Readonly<Record<string, Line>> = {
  substitute: E.substitute.render,
  leechseed: E.seeded.render,
  confusion: E.confused.render,
  focusenergy: E.pumped.render,
  taunt: E.taunted.render,
  encore: E.encored.render,
  attract: E.inLove.render,
  yawn: E.drowsy.render,
  nightmare: E.nightmare.render,
  firespin: E.vortex.render,
  whirlpool: E.vortex.render,
  sandtomb: E.quicksand.render,
  // Mean Look's `-activate|<target>|trapped`, which the parser reads as a start.
  trapped: E.cantEscape.render,
  rage: E.rageBuilding.render,
  // Gen 1 and 2 log Mist as a start on its user; Gen 3 as a side start (`sideStarted`).
  mist: FIELD_TEMPLATES.mist.render,
  futuresight: E.foresaw.render,
  doomdesire: E.choseDestiny.render,
  // Gen 3 logs the sports as starts on their user; the game's line names the type they weaken.
  mudsport: FIELD_TEMPLATES.electricWeakened.render,
  watersport: FIELD_TEMPLATES.fireWeakened.render,
}

/**
 * The start lines of the partial traps that name their trapper, by the move's id, as
 * `gWrappedStringIds` keys the game's lines by the move; Fire Spin's, Whirlpool's and Sand Tomb's
 * name none and sit in `STARTS`. `scripts/gen3-traps.test.ts` ties these ids to that table.
 */
const TRAPPED_BY: Readonly<Record<string, (who: Mon, trapper: Mon) => string>> = {
  bind: E.squeezed.render,
  wrap: E.wrapped.render,
  clamp: E.clamped.render,
}

function startText(who: Mon, id: string, source: Mon | undefined): string | undefined {
  const perish = /^perish(\d)$/.exec(id)?.[1]
  if (perish !== undefined) return E.perish.render(who, perish)
  if (id === 'curse') return source && E.cursed.render(source, who)
  const trapped = TRAPPED_BY[id]
  if (trapped !== undefined) return source && trapped(who, source)
  return STARTS[id]?.(who) ?? screenRaised(who.side, id)
}

/** The start lines that name the effect's detail, by the effect's id. */
const STARTS_WITH_DETAIL: Readonly<Record<string, (who: Mon, detail: string) => string>> = {
  disable: (who, move) => E.disabled.render(who, moveName(move)),
}

/**
 * An effect that starts on `who`; `source` is the Pokémon of `[of]`: Curse's user, or the
 * trapper of a partial trap. `detail` is what the line names beside the effect (Disable's move);
 * a line that does not use it lists it, so it never goes unseen.
 */
export function effectStarted(
  who: Mon,
  effect: Effect,
  source: Mon | undefined,
  detail?: string,
): Phrase {
  const id = toID(effect.name)
  const withDetail = STARTS_WITH_DETAIL[id]
  if (detail !== undefined && withDetail !== undefined) return { text: withDetail(who, detail) }
  const game = startText(who, id, source)
  const text = game ?? `${nameAtStart(who)} is under ${held(effect.name)}!`
  if (detail !== undefined) return ownPhrase(text, `${effect.name} starting with ${detail}`)
  return game === undefined ? ownPhrase(text, `${effect.name} starting`) : { text }
}

const ACTS: Readonly<Record<string, Line>> = {
  substitute: E.substituteHit.render,
  confusion: E.isConfused.render,
  destinybond: E.tookFoe.render,
  bide: E.storingEnergy.render,
  // Heal Bell's shape from Gen 5 on; Gen 2 to 4 log `-cureteam`, which says the same line.
  healbell: STATUS_TEMPLATES.bell.render,
}

/** An effect that acts; Splash's "nothing" names no Pokémon. */
export function effectActivated(who: Mon | undefined, effect: Effect): Phrase {
  const id = toID(effect.name)
  if (id === 'splash') return { text: E.nothing.render() }
  const text = who && ACTS[id]?.(who)
  if (text !== undefined) return { text }
  const name = held(effect.name)
  const own = who === undefined ? `${name} took effect!` : `${nameAtStart(who)} used ${name}!`
  return ownPhrase(own, `${effect.name} acting`)
}

const ENDS: Readonly<Record<string, Line>> = {
  substitute: E.substituteFaded.render,
  confusion: E.confusionEnded.render,
  leechseed: E.seedShed.render,
  encore: E.encoreEnded.render,
  disable: E.disableEnded.render,
  bide: E.unleashedEnergy.render,
}

/** The end lines that name the effect's move, by the effect's id. */
const ENDS_NAMING_MOVE: Readonly<Record<string, (who: Mon, move: string) => string>> = {
  futuresight: E.tookAttack.render,
  doomdesire: E.tookAttack.render,
}

export function effectEnded(who: Mon, effect: Effect): Phrase {
  const namingMove = isTrapping(effect.name) ? E.freed.render : ENDS_NAMING_MOVE[toID(effect.name)]
  const text = namingMove ? namingMove(who, moveName(effect.name)) : ENDS[toID(effect.name)]?.(who)
  if (text !== undefined) return { text }
  const own = `${ownerAtStart(who)} ${held(effect.name)} wore off!`
  return ownPhrase(own, `${effect.name} ending`)
}

const SINGLE_TURN: Readonly<Record<string, Line>> = {
  protect: E.protecting.render,
  endure: E.braced.render,
  focuspunch: E.focusing.render,
}

/** An effect that lasts the turn, such as Protect or Focus Punch's focus. */
export function singleTurn(who: Mon, effect: Effect): Phrase {
  const text = SINGLE_TURN[toID(effect.name)]?.(who)
  if (text !== undefined) return { text }
  const own = `${nameAtStart(who)} is ready with ${held(effect.name)}!`
  return ownPhrase(own, `${effect.name} for one turn`)
}

const SINGLE_MOVE: Readonly<Record<string, Line>> = {
  destinybond: E.hopingToTakeFoe.render,
  grudge: E.grudge.render,
}

/** Effects the game starts without a line: Rage says its line as a hit raises Attack. */
const SILENT_SINGLE_MOVE: ReadonlySet<string> = new Set(['rage'])

/** An effect that lasts until `who` moves again, or undefined where the game says nothing. */
export function singleMove(who: Mon, effect: Effect): Phrase | undefined {
  const id = toID(effect.name)
  if (SILENT_SINGLE_MOVE.has(id)) return undefined
  const text = SINGLE_MOVE[id]?.(who)
  if (text !== undefined) return { text }
  const own = `${nameAtStart(who)} readied ${held(effect.name)}!`
  return ownPhrase(own, `${effect.name} until the next move`)
}

/** `who`'s rage builds as a hit raises its Attack. */
export const rageBuilding = (who: Mon) => E.rageBuilding.render(who)

/** `who` took the stat stages of `from` (Psych Up). */
export const copiedStats = (who: Mon, from: Mon) => E.copiedStats.render(who, from)

/** `who` turned into the species `species`, by the expansion's name for it. */
export const transformed = (who: Mon, species: string) =>
  E.transformed.render(who, speciesName(species))

/** `who` took another form of its species. */
export const formChanged = (who: Mon) => E.formChanged.render(who)

/** The two lines of `who`'s Terastallization into `type`, in the order the game says them. */
export const terastallizing = (who: Mon, type: string): readonly [string, string] => [
  E.storingEnergy.render(who),
  E.terastallized.render(who, type),
]

/** A move `who` kept off, such as by Protect or Safeguard. */
export function blocked(who: Mon, effect: Effect): Phrase {
  const id = toID(effect.name)
  if (id === 'protect') return { text: E.protected.render(who) }
  if (id === 'safeguard') return { text: E.safeguarded.render(who) }
  const own = `${nameAtStart(who)} was protected by ${held(effect.name)}!`
  return ownPhrase(own, `a block by ${effect.name}`)
}
