// Rules for the lines that move Pokémon in and out: switches, drags and faints.

import { effectOf, healthOf, pokemonOf, refOf, refOfPokemon } from '../refs'
import type { ScriptEvent } from '../types'
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
} satisfies Rules
