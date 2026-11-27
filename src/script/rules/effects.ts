// Rules for the effects on one Pokémon: volatile effects such as Substitute, the effects of a
// single turn and until the next move, copied stat stages, items and abilities.

import { ScriptError } from '../errors'
import type { EffectActivateEvent } from '../effect-events'
import type { ScriptEvent } from '../events'
import { keywordDetail } from '../drops'
import { causeOf, effectOf, flagsOf, foesInPlace, refIfAny, refOf, refOfPokemon } from '../refs'
import type { PokemonRef } from '../types'
import type { RuleInput, Rules } from './index'

type ItemInput = RuleInput<'|-item|'>
type ActivateInput = RuleInput<'|-activate|'>

/**
 * The holder an item line tells: its Pokémon, or for Frisk's Gen 5 line, which names none, the one
 * foe in place of the Pokémon of `[of]`, the only one Frisk can have looked at (#117). With two
 * foes in place the line tells no holder, and the text says so.
 */
function itemHolder({ line, args: [, who], kwArgs, battle }: ItemInput): PokemonRef | string {
  if (who) return refOf(battle, who, line)
  const foes = foesInPlace(battle, kwArgs.of ?? '', line)
  const [foe] = foes
  if (foe !== undefined && foes.length === 1) return refOfPokemon(foe, line)
  const count = String(foes.length)
  return `${effectOf(kwArgs.from ?? '').name} names no holder among the ${count} foes in place`
}

/** The item event of a line whose holder `itemHolder` tells. */
function itemShown(input: ItemInput): ScriptEvent[] {
  const { line, args, kwArgs, battle } = input
  const who = itemHolder(input)
  if (typeof who === 'string') throw new ScriptError(line, who)
  return [{ kind: 'item', line, who, item: args[2], ...causeOf(kwArgs, battle, line) }]
}

/**
 * The ability an activation replaces when the ability passes itself on to the Pokémon of `[of]`
 * (Mummy, #117): the line names the one it replaces and no second one. An activation that names two
 * abilities swaps them, which no event holds yet.
 */
function replacedAbility({ args: [, , effect], kwArgs }: ActivateInput): string | undefined {
  const { ability, ability2 } = kwArgs
  if (effectOf(effect).kind !== 'ability' || ability2 || !ability) return undefined
  return ability
}

/** The Pokémon of `[of]` takes on the holder's ability, as the other changes of ability read. */
function abilityPassed(input: ActivateInput, replaces: string): ScriptEvent {
  const {
    line,
    args: [, holder, effect, of],
    battle,
  } = input
  const cause = effectOf(effect)
  return {
    kind: 'ability',
    line,
    who: refOf(battle, of ?? '', line),
    ability: cause.name,
    replaces,
    cause,
    source: refOf(battle, holder, line),
  }
}

/** Any other activation: the effect on its Pokémon, with the Pokémon of `[of]` as its source. */
function activation(input: ActivateInput): EffectActivateEvent {
  const {
    line,
    args: [, ident, effect, of],
    kwArgs,
    battle,
  } = input
  const who = refIfAny(battle, ident, line)
  const source = refIfAny(battle, of, line)
  return {
    kind: 'effectActivate',
    line,
    ...(who ? { who } : {}),
    effect: effectOf(effect),
    ...(source ? { source } : {}),
    ...flagsOf(kwArgs, ['damage', 'consumed']),
  }
}

export const EFFECT_RULES = {
  // A partial trap starts as `-activate|…|move: Fire Spin|[of] …`; the parser turns it into this.
  // The third argument is what the effect names beside it, such as Disable's move (plan D14).
  '|-start|': {
    arity: 3,
    reads: ['from', 'of', 'silent'],
    build: ({ line, args: [, who, effect, detail], kwArgs, battle }) => [
      {
        kind: 'effectStart',
        line,
        who: refOf(battle, who, line),
        effect: effectOf(effect),
        ...(detail ? { detail } : {}),
        ...causeOf(kwArgs, battle, line),
        ...flagsOf(kwArgs, ['silent']),
      },
    ],
  },
  // A partial trap's `[partiallytrapped]` maps to nothing: the effect names the trapping move.
  '|-end|': {
    arity: 2,
    reads: ['from', 'of', 'silent', 'partiallytrapped'],
    build: ({ line, args: [, who, effect], kwArgs, battle }) => [
      {
        kind: 'effectEnd',
        line,
        who: refOf(battle, who, line),
        effect: effectOf(effect),
        ...causeOf(kwArgs, battle, line),
        ...flagsOf(kwArgs, ['silent']),
      },
    ],
  },
  // The parser moves `[of]` into the third argument: Trick names its target there. It moves the
  // abilities an activation names into `[ability]` and `[ability2]`.
  '|-activate|': {
    arity: 3,
    reads: ['of', 'damage', 'consumed', 'ability', 'ability2'],
    // Tested by the key, as `unreadPart` tests: Skill Swap's bare line sets it with no value.
    unsupported: (input) =>
      'ability' in input.kwArgs && replacedAbility(input) === undefined
        ? keywordDetail('ability')
        : undefined,
    build: (input) => {
      const replaces = replacedAbility(input)
      return [replaces === undefined ? activation(input) : abilityPassed(input, replaces)]
    },
  },
  // The client copies the target's boosts, types and moves; the script keeps who turned into whom.
  '|-transform|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, who, into], battle }) => [
      { kind: 'transform', line, who: refOf(battle, who, line), into: refOf(battle, into, line) },
    ],
  },
  '|-singleturn|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, who, effect], battle }) => [
      { kind: 'singleTurn', line, who: refOf(battle, who, line), effect: effectOf(effect) },
    ],
  },
  '|-singlemove|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, who, effect], battle }) => [
      { kind: 'singleMove', line, who: refOf(battle, who, line), effect: effectOf(effect) },
    ],
  },
  // The client copies the stages; the script keeps who took them from whom.
  '|-copyboost|': {
    arity: 2,
    reads: ['from'],
    build: ({ line, args: [, who, from], kwArgs, battle }) => [
      {
        kind: 'copyBoost',
        line,
        who: refOf(battle, who, line),
        from: refOf(battle, from, line),
        ...causeOf(kwArgs, battle, line),
      },
    ],
  },
  '|-item|': {
    arity: 2,
    reads: ['from', 'of'],
    unsupported: (input) => {
      const who = itemHolder(input)
      return typeof who === 'string' ? who : undefined
    },
    build: itemShown,
  },
  '|-enditem|': {
    arity: 2,
    reads: ['from', 'of', 'eat', 'weaken', 'silent'],
    build: ({ line, args: [, who, item], kwArgs, battle }) => [
      {
        kind: 'itemEnd',
        line,
        who: refOf(battle, who, line),
        item,
        ...causeOf(kwArgs, battle, line),
        ...(kwArgs.eat ? { eaten: true } : {}),
        ...(kwArgs.weaken ? { weakened: true } : {}),
        ...flagsOf(kwArgs, ['silent']),
      },
    ],
  },
  '|-ability|': {
    arity: 3,
    reads: ['from', 'of'],
    build: ({ line, args: [, who, ability, detail], kwArgs, battle }) => [
      {
        kind: 'ability',
        line,
        who: refOf(battle, who, line),
        ability,
        ...(detail ? { detail } : {}),
        ...causeOf(kwArgs, battle, line),
      },
    ],
  },
} satisfies Rules
