// Phrases for effects that last one turn or until their holder's next move, and for the moves
// they keep off (plan §5): Protect, Endure, Focus Punch's focus, Destiny Bond, Grudge, Safeguard.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { held, type Mon, nameAtStart } from './names'
import { type Line, start } from './phrases-effects'
import { ownPhrase, type Phrase, tagged } from './template'

export const TURN_TEMPLATES = {
  protected: tagged('STRINGID_PKMNPROTECTEDITSELF', start('protected itself!')),
  protecting: tagged('STRINGID_PKMNPROTECTEDITSELF2', start('protected itself!')),
  braced: tagged('STRINGID_PKMNBRACEDITSELF', start('braced itself!')),
  focusing: tagged('STRINGID_PKMNTIGHTENINGFOCUS', start('is tightening its focus!')),
  // `BattleScript_EffectDestinyBond` and `BattleScript_EffectGrudge`, with the user as B_ATK.
  hopingToTakeFoe: tagged(
    'STRINGID_PKMNTRYINGTOTAKEFOE',
    start('is hoping to take its attacker down with it!'),
  ),
  grudge: tagged('STRINGID_PKMNWANTSGRUDGE', start('wants its target to bear a grudge!')),
  // `BattleScript_SafeguardProtected`, with the Pokémon Safeguard guards as B_SCR.
  safeguarded: tagged('STRINGID_PKMNUSEDSAFEGUARD', start('is protected by Safeguard!')),
}

const E = TURN_TEMPLATES

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

/** A move `who` kept off, such as by Protect or Safeguard. */
export function blocked(who: Mon, effect: Effect): Phrase {
  const id = toID(effect.name)
  if (id === 'protect') return { text: E.protected.render(who) }
  if (id === 'safeguard') return { text: E.safeguarded.render(who) }
  const own = `${nameAtStart(who)} was protected by ${held(effect.name)}!`
  return ownPhrase(own, `a block by ${effect.name}`)
}
