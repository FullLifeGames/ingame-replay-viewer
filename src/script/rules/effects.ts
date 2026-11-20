// Rules for the effects on one Pokémon: volatile effects such as Substitute, the effects of a
// single turn, items and abilities.

import { causeOf, effectOf, flagsOf, refOf } from '../refs'
import type { Rules } from './index'

export const EFFECT_RULES = {
  '|-start|': {
    arity: 2,
    reads: ['from', 'of', 'silent'],
    build: ({ line, args: [, who, effect], kwArgs, battle }) => [
      {
        kind: 'effectStart',
        line,
        who: refOf(battle, who, line),
        effect: effectOf(effect),
        ...causeOf(kwArgs, battle, line),
        ...flagsOf(kwArgs, ['silent']),
      },
    ],
  },
  '|-end|': {
    arity: 2,
    reads: ['from', 'of', 'silent'],
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
    build: ({ line, args: [, who, effect], kwArgs, battle }) => [
      {
        kind: 'effectActivate',
        line,
        who: refOf(battle, who, line),
        effect: effectOf(effect),
        ...flagsOf(kwArgs, ['damage']),
      },
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
