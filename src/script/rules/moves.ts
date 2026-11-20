// Rules for the lines around a move: the move itself, a Pokémon that cannot move, a miss, a
// failure, an immunity, a block such as Protect's, and the critical hit and effectiveness lines
// that `hits.ts` folds into the hit after them.

import { causeOf, effectOf, flagsOf, refIfAny, refOf } from '../refs'
import type { Rules } from './index'

export const MOVE_RULES = {
  '|move|': {
    arity: 3,
    reads: ['from', 'miss', 'still', 'notarget'],
    build: ({ line, args: [, user, move, target], kwArgs, battle }) => {
      const ref = refIfAny(battle, target, line)
      return [
        {
          kind: 'move',
          line,
          user: refOf(battle, user, line),
          move,
          ...(ref ? { target: ref } : {}),
          ...(kwArgs.from ? { calledBy: effectOf(kwArgs.from) } : {}),
          ...flagsOf(kwArgs, ['miss', 'still', 'notarget']),
        },
      ]
    },
  },
  '|cant|': {
    arity: 3,
    reads: [],
    build: ({ line, args: [, who, reason, move], battle }) => [
      {
        kind: 'cant',
        line,
        who: refOf(battle, who, line),
        reason: effectOf(reason),
        ...(move ? { move } : {}),
      },
    ],
  },
  '|-miss|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, user, target], battle }) => {
      const ref = refIfAny(battle, target, line)
      return [
        { kind: 'miss', line, user: refOf(battle, user, line), ...(ref ? { target: ref } : {}) },
      ]
    },
  },
  '|-fail|': {
    arity: 3,
    reads: ['from', 'of'],
    build: ({ line, args: [, who, effect, stat], kwArgs, battle }) => [
      {
        kind: 'fail',
        line,
        who: refOf(battle, who, line),
        ...(effect ? { effect: effectOf(effect) } : {}),
        ...(stat ? { stat } : {}),
        ...causeOf(kwArgs, battle, line),
      },
    ],
  },
  '|-immune|': {
    arity: 1,
    reads: ['from', 'of'],
    build: ({ line, args: [, who], kwArgs, battle }) => [
      { kind: 'immune', line, who: refOf(battle, who, line), ...causeOf(kwArgs, battle, line) },
    ],
  },
  '|-block|': {
    arity: 3,
    reads: ['of'],
    build: ({ line, args: [, who, effect, move], kwArgs, battle }) => [
      {
        kind: 'block',
        line,
        who: refOf(battle, who, line),
        effect: effectOf(effect),
        ...(move ? { move } : {}),
        ...causeOf(kwArgs, battle, line),
      },
    ],
  },
  '|-crit|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, who], battle }) => [
      { kind: 'crit', line, who: refOf(battle, who, line) },
    ],
  },
  '|-supereffective|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, who], battle }) => [
      { kind: 'effectiveness', line, who: refOf(battle, who, line), effectiveness: 'super' },
    ],
  },
  '|-resisted|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, who], battle }) => [
      { kind: 'effectiveness', line, who: refOf(battle, who, line), effectiveness: 'resisted' },
    ],
  },
} satisfies Rules
