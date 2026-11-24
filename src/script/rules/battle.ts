// Rules for the lines that frame a battle: the intro, turns, text and the result.

import { isNamedPlayer } from '../drops'
import { ScriptError } from '../errors'
import { numberOf, sideOf } from '../refs'
import type { Side } from '../types'
import type { Rules } from './index'

const SIDES: readonly Side[] = ['near', 'far']

export const BATTLE_RULES = {
  '|player|': {
    arity: 4,
    reads: [],
    build: ({ line, args }) => {
      // dropReasonOf drops a player line without a name before any rule sees it.
      if (!isNamedPlayer(args)) {
        throw new ScriptError(line, 'a player line without a name reached its rule')
      }
      const [, player, name, avatar, rating] = args
      return [
        {
          kind: 'player',
          line,
          side: sideOf(player, line),
          name,
          ...(avatar ? { avatar } : {}),
          ...(rating ? { rating: numberOf(rating, line) } : {}),
        },
      ]
    },
  },
  '|teamsize|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, player, size] }) => [
      { kind: 'teamSize', line, side: sideOf(player, line), size: numberOf(size, line) },
    ],
  },
  '|start|': { arity: 0, reads: [], build: ({ line }) => [{ kind: 'battleStart', line }] },
  '|turn|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, number] }) => [{ kind: 'turn', line, number: numberOf(number, line) }],
  },
  '|-message|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, text] }) => [{ kind: 'message', line, text }],
  },
  // The server's own line in the battle, such as the turn limit's, reads as `|-message|`.
  '|message|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, text] }) => [{ kind: 'message', line, text }],
  },
  '|win|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, name], before: { players } }) => {
      const side = SIDES.find((candidate) => players[candidate] === name)
      return [{ kind: 'win', line, ...(side ? { side } : {}), name }]
    },
  },
  '|tie|': { arity: 0, reads: [], build: ({ line }) => [{ kind: 'tie', line }] },
} satisfies Rules
