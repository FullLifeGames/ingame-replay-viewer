// Phrases for effects on one Pokémon (plan §5): Substitute, Leech Seed, confusion, the perish
// count and the like as they start, act and end, effects for one turn, and blocks.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { held, type Mon, moveName, nameAtStart, nameInside, ownerAtStart } from './names'
import { isTrapping } from './phrases-hp'
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
}

function startText(who: Mon, id: string, source: Mon | undefined): string | undefined {
  const perish = /^perish(\d)$/.exec(id)?.[1]
  if (perish !== undefined) return E.perish.render(who, perish)
  if (id === 'curse') return source && E.cursed.render(source, who)
  return STARTS[id]?.(who)
}

/** An effect that starts on `who`; `source` is the Pokémon of `[of]` (Curse's user). */
export function effectStarted(who: Mon, effect: Effect, source: Mon | undefined): Phrase {
  const text = startText(who, toID(effect.name), source)
  if (text !== undefined) return { text }
  const own = `${nameAtStart(who)} is under ${held(effect.name)}!`
  return ownPhrase(own, `${effect.name} starting`)
}

const ACTS: Readonly<Record<string, Line>> = {
  substitute: E.substituteHit.render,
  confusion: E.isConfused.render,
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
}

export function effectEnded(who: Mon, effect: Effect): Phrase {
  const text = isTrapping(effect.name)
    ? E.freed.render(who, moveName(effect.name))
    : ENDS[toID(effect.name)]?.(who)
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

/** A move `who` kept off, such as by Protect. */
export function blocked(who: Mon, effect: Effect): Phrase {
  if (toID(effect.name) === 'protect') return { text: E.protected.render(who) }
  const own = `${nameAtStart(who)} was protected by ${held(effect.name)}!`
  return ownPhrase(own, `a block by ${effect.name}`)
}
