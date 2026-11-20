// Rules for the lines about the whole field or one side of it: weather, entry hazards and
// field-wide effects such as Perish Song.

import type { WeatherName } from '@pkmn/client'

import { ScriptError } from '../errors'
import { causeOf, effectOf, sideOfArg } from '../refs'
import type { Before, Rules } from './index'

type Phase = 'start' | 'upkeep' | 'end'

/** The weather a line is about: the one that ends for `none`, else the one the client holds. */
function weatherOf(phase: Phase, current: WeatherName | undefined, before: Before, at: number) {
  const weather = phase === 'end' ? before.weather : current
  if (weather === undefined) {
    throw new ScriptError(at, `no weather is active for this ${phase}`)
  }
  return weather
}

function phaseOf(name: string, upkeep: boolean): Phase {
  if (name === 'none') {
    return 'end'
  }
  return upkeep ? 'upkeep' : 'start'
}

export const FIELD_RULES = {
  '|-weather|': {
    arity: 1,
    reads: ['from', 'of', 'upkeep'],
    build: ({ line, args: [, name], kwArgs, battle, before }) => {
      const phase = phaseOf(name, kwArgs.upkeep === true)
      const weather = weatherOf(phase, battle.field.weather, before, line)
      return [{ kind: 'weather', line, weather, phase, ...causeOf(kwArgs, battle, line) }]
    },
  },
  '|-sidestart|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, side, condition] }) => [
      { kind: 'sideStart', line, side: sideOfArg(side, line), condition: effectOf(condition) },
    ],
  },
  '|-sideend|': {
    arity: 2,
    reads: ['from', 'of'],
    build: ({ line, args: [, side, condition], kwArgs, battle }) => [
      {
        kind: 'sideEnd',
        line,
        side: sideOfArg(side, line),
        condition: effectOf(condition),
        ...causeOf(kwArgs, battle, line),
      },
    ],
  },
  '|-fieldactivate|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, effect] }) => [
      { kind: 'fieldActivate', line, effect: effectOf(effect) },
    ],
  },
} satisfies Rules
