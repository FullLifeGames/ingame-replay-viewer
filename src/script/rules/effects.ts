// Rules for the effects on one Pokémon: volatile effects such as Substitute, the effects of a
// single turn, items and abilities.

import { causeOf, effectOf, flagsOf, refIfAny, refOf } from '../refs'
import type { Rules } from './index'

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
  '|-activate|': {
    arity: 2,
    reads: ['damage'],
    build: ({ line, args: [, ident, effect], kwArgs, battle }) => {
      const who = refIfAny(battle, ident, line)
      return [
        {
          kind: 'effectActivate',
          line,
          ...(who ? { who } : {}),
          effect: effectOf(effect),
          ...flagsOf(kwArgs, ['damage']),
        },
      ]
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
  '|-item|': {
    arity: 2,
    reads: ['from', 'of'],
    build: ({ line, args: [, who, item], kwArgs, battle }) => [
      { kind: 'item', line, who: refOf(battle, who, line), item, ...causeOf(kwArgs, battle, line) },
    ],
  },
  '|-enditem|': {
    arity: 2,
    reads: ['from', 'of', 'eat', 'silent'],
    build: ({ line, args: [, who, item], kwArgs, battle }) => [
      {
        kind: 'itemEnd',
        line,
        who: refOf(battle, who, line),
        item,
        ...causeOf(kwArgs, battle, line),
        ...(kwArgs.eat ? { eaten: true } : {}),
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
