// Rules for the lines about one Pokémon: switches, drags, faints, HP, status and stat changes.

import type { Pokemon } from '@pkmn/client'

import { ScriptError } from '../errors'
import type { ScriptEvent } from '../events'
import {
  causeOf,
  effectOf,
  flagsOf,
  healthOf,
  numberOf,
  pokemonOf,
  refOf,
  refOfPokemon,
} from '../refs'
import type { PokemonRef } from '../types'
import type { RuleInput, Rules } from './index'

type SwitchKey = '|switch|' | '|drag|'

function switchIn({ line, args, kwArgs, battle, before }: RuleInput<SwitchKey>): ScriptEvent[] {
  const [kind, ident, , hpStatus] = args
  const pokemon = pokemonOf(battle, ident, line)
  const who = refOfPokemon(pokemon, line)
  // The slot is empty after a faint; otherwise the client held the Pokémon sent back.
  const previous = before.active[who.side]
  const from = 'from' in kwArgs ? kwArgs.from : undefined
  return [
    {
      kind: 'switchIn',
      line,
      who,
      ...(previous ? { replaces: refOfPokemon(previous, line) } : {}),
      dragged: kind === 'drag',
      ...(from ? { cause: effectOf(from) } : {}),
      ...healthOf(hpStatus, pokemon.maxhp, line),
    },
  ]
}

type HpKey = '|-damage|' | '|-heal|'

/** The fields a damage and a heal share: who, the HP bar after it, and why. */
function hpChange({ line, args: [, ident, hpStatus], kwArgs, battle }: RuleInput<HpKey>) {
  const pokemon = pokemonOf(battle, ident, line)
  return {
    line,
    who: refOfPokemon(pokemon, line),
    ...healthOf(hpStatus, pokemon.maxhp, line),
    ...causeOf(kwArgs, battle, line),
    ...flagsOf(kwArgs, ['silent']),
  }
}

/** The team member whose Wish came true; the log names it by its nickname. */
function wisherOf(pokemon: Pokemon, name: string, at: number): PokemonRef {
  const wisher = pokemon.side.team.find((member) => member.name === name)
  if (wisher === undefined) {
    throw new ScriptError(at, `no wisher "${name}" has appeared`)
  }
  return refOfPokemon(wisher, at)
}

function heal(input: RuleInput<'|-heal|'>): ScriptEvent[] {
  const { line, args, kwArgs, battle } = input
  const wisher = kwArgs.wisher && wisherOf(pokemonOf(battle, args[1], line), kwArgs.wisher, line)
  return [{ kind: 'heal', ...hpChange(input), ...(wisher ? { wisher } : {}) }]
}

type StatKey = '|-boost|' | '|-unboost|'

/** A change of 0 stages is a stat at its limit; it keeps the direction the line's kind gives. */
function statChange({ line, args, kwArgs, battle }: RuleInput<StatKey>): ScriptEvent[] {
  const [kind, ident, stat, amount] = args
  const who = refOf(battle, ident, line)
  const cause = kwArgs.from ? { cause: effectOf(kwArgs.from) } : {}
  const stages = numberOf(amount, line)
  if (stages === 0) {
    const direction = kind === '-unboost' ? 'down' : 'up'
    return [{ kind: 'statLimit', line, who, stat, direction, ...cause }]
  }
  const sign = kind === '-unboost' ? -1 : 1
  return [{ kind: 'statChange', line, who, stat, stages: sign * stages, ...cause }]
}

export const POKEMON_RULES = {
  '|switch|': { arity: 3, reads: ['from'], build: switchIn },
  '|drag|': { arity: 3, reads: [], build: switchIn },
  '|faint|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, ident], battle }) => [
      { kind: 'faint', line, who: refOf(battle, ident, line) },
    ],
  },
  '|-damage|': {
    arity: 2,
    reads: ['from', 'of', 'silent'],
    build: (input) => [{ kind: 'damage', ...hpChange(input) }],
  },
  '|-heal|': { arity: 2, reads: ['from', 'of', 'silent', 'wisher'], build: heal },
  '|-status|': {
    arity: 2,
    reads: ['from', 'of'],
    build: ({ line, args: [, who, status], kwArgs, battle }) => [
      {
        kind: 'status',
        line,
        who: refOf(battle, who, line),
        status,
        ...causeOf(kwArgs, battle, line),
      },
    ],
  },
  '|-curestatus|': {
    arity: 2,
    reads: ['from', 'silent', 'msg'],
    build: ({ line, args: [, who, status], kwArgs, battle }) => [
      {
        kind: 'cureStatus',
        line,
        who: refOf(battle, who, line),
        status,
        ...(kwArgs.from ? { cause: effectOf(kwArgs.from) } : {}),
        ...flagsOf(kwArgs, ['silent', 'msg']),
      },
    ],
  },
  '|-cureteam|': {
    arity: 1,
    reads: ['from'],
    build: ({ line, args: [, who], kwArgs, battle }) => [
      {
        kind: 'cureTeam',
        line,
        who: refOf(battle, who, line),
        ...(kwArgs.from ? { cause: effectOf(kwArgs.from) } : {}),
      },
    ],
  },
  '|-boost|': { arity: 3, reads: ['from'], build: statChange },
  '|-unboost|': { arity: 3, reads: ['from'], build: statChange },
} satisfies Rules
