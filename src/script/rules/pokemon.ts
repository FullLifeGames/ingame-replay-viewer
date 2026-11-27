// Rules for the lines about one Pokémon: switches, drags, Illusion's end, faints, HP, status, stat
// stages, forms and Terastallization.

import type { Pokemon } from '@pkmn/client'
import type { BoostID } from '@pkmn/data'

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

/**
 * Illusion's end (#98): the client puts the real Pokémon where the disguise stood and copies the
 * disguise's HP and status over (`Side.replace`), as the line carries neither.
 */
function replace({ line, args: [, ident], battle, before }: RuleInput<'|replace|'>): ScriptEvent[] {
  const pokemon = pokemonOf(battle, ident, line)
  const who = refOfPokemon(pokemon, line)
  const disguise = before.active[who.side]
  if (!disguise) throw new ScriptError(line, `no disguise stands where "${ident}" appears`)
  const hp = { hp: pokemon.hp, max: pokemon.maxhp }
  const replaces = refOfPokemon(disguise, line)
  const status = pokemon.status ? { status: pokemon.status } : {}
  return [{ kind: 'replace', line, who, replaces, hp, ...status }]
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

/**
 * HP set outright (Pain Split). Showdown logs one line per Pokémon, the first `[silent]`, so one
 * line says it. The older line names both Pokémon; its first one is silent the same way.
 */
function setHp({ line, args, kwArgs, battle }: RuleInput<'|-sethp|'>): ScriptEvent[] {
  const cause = causeOf(kwArgs, battle, line)
  const setOne = (ident: string, hpStatus: string, silent: boolean): ScriptEvent => {
    const pokemon = pokemonOf(battle, ident, line)
    const who = refOfPokemon(pokemon, line)
    const health = healthOf(hpStatus, pokemon.maxhp, line)
    return { kind: 'setHp', line, who, ...health, ...cause, ...(silent ? { silent } : {}) }
  }
  const silent = kwArgs.silent === true
  if (args.length === 3) return [setOne(args[1], args[2], silent)]
  return [setOne(args[1], args[2], true), setOne(args[3], args[4], silent)]
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

/**
 * A stage set outright (Belly Drum) changes the stat by the stages from the one before the line,
 * which `before` keeps, to the line's number; no change is a stat at its limit.
 */
function statSet({ line, args, kwArgs, battle, before }: RuleInput<'|-setboost|'>): ScriptEvent[] {
  const [, ident, stat, amount] = args
  const who = refOf(battle, ident, line)
  const cause = kwArgs.from ? { cause: effectOf(kwArgs.from) } : {}
  const set = numberOf(amount, line)
  const stages = set - (before.boosts[who.side][stat] ?? 0)
  if (stages === 0) {
    return [{ kind: 'statLimit', line, who, stat, direction: set < 0 ? 'down' : 'up', ...cause }]
  }
  return [{ kind: 'statChange', line, who, stat, stages, ...cause }]
}

/** The lowered stages of one Pokémon back to 0 (White Herb), from the stages before the line. */
function negativeStatReset(input: RuleInput<'|-clearnegativeboost|'>): ScriptEvent[] {
  const { line, args, kwArgs, battle, before } = input
  const who = refOf(battle, args[1], line)
  const restored: Partial<Record<BoostID, number>> = {}
  for (const [stat, stages] of Object.entries(before.boosts[who.side]) as [BoostID, number][]) {
    if (stages < 0) restored[stat] = -stages
  }
  return [{ kind: 'negativeStatReset', line, who, restored, ...flagsOf(kwArgs, ['silent']) }]
}

/** A form until the Pokémon leaves the field: Castform's Forecast in Gen 3. */
function formChange({ line, args, kwArgs, battle }: RuleInput<'|-formechange|'>): ScriptEvent[] {
  const [, ident, species] = args
  return [
    {
      kind: 'formChange',
      line,
      who: refOf(battle, ident, line),
      species,
      ...causeOf(kwArgs, battle, line),
      ...flagsOf(kwArgs, ['msg']),
    },
  ]
}

export const POKEMON_RULES = {
  '|switch|': { arity: 3, reads: ['from'], build: switchIn },
  '|drag|': { arity: 3, reads: [], build: switchIn },
  // The details, the second argument, name the real Pokémon; the client reads them.
  '|replace|': { arity: 2, reads: [], build: replace },
  '|faint|': {
    arity: 1,
    reads: [],
    build: ({ line, args: [, ident], battle }) => [
      { kind: 'faint', line, who: refOf(battle, ident, line) },
    ],
  },
  // `[partiallytrapped]` marks a partial trap's damage each turn and maps to nothing: the `[from]`
  // cause already names the trapping move.
  '|-damage|': {
    arity: 2,
    reads: ['from', 'of', 'silent', 'partiallytrapped'],
    build: (input) => [{ kind: 'damage', ...hpChange(input) }],
  },
  '|-heal|': { arity: 2, reads: ['from', 'of', 'silent', 'wisher'], build: heal },
  '|-sethp|': { arity: 4, reads: ['from', 'silent'], build: setHp },
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
  '|-setboost|': { arity: 3, reads: ['from'], build: statSet },
  '|-clearnegativeboost|': { arity: 1, reads: ['silent'], build: negativeStatReset },
  // The third argument, when present, is empty.
  '|-formechange|': { arity: 2, reads: ['from', 'of', 'msg'], build: formChange },
  // The type is the log's, as @pkmn/protocol reads it.
  '|-terastallize|': {
    arity: 2,
    reads: [],
    build: ({ line, args: [, ident, type], battle }) => [
      { kind: 'terastallize', line, who: refOf(battle, ident, line), type },
    ],
  },
  // Haze: the line names no Pokémon; the client resets the stages of every active one.
  '|-clearallboost|': { arity: 0, reads: [], build: ({ line }) => [{ kind: 'statReset', line }] },
} satisfies Rules
