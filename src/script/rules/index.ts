// A rule turns one kind of battle log line into events. Each rule states what it reads, so a
// line with anything more becomes an `unsupported` dropped line instead of losing a part.

import type { Battle, Pokemon, WeatherName } from '@pkmn/client'
import type { BoostID } from '@pkmn/data'
import type { Protocol } from '@pkmn/protocol'

import type { LogLine } from '../lines'
import type { ScriptEvent } from '../events'
import type { Side } from '../types'
import { BATTLE_RULES } from './battle'
import { EFFECT_RULES } from './effects'
import { FIELD_RULES } from './field'
import { MOVE_RULES } from './moves'
import { POKEMON_RULES } from './pokemon'

/** What the build knew just before the line was added. */
export interface Before {
  /** The client's active Pokémon. */
  readonly active: Readonly<Record<Side, Pokemon | null>>
  /**
   * A copy of the boosts of each active Pokémon: the client changes its Pokémon in place, so a
   * rule reads the stages before its line here (`-setboost`).
   */
  readonly boosts: Readonly<Record<Side, Readonly<Partial<Record<BoostID, number>>>>>
  /** The client's weather. */
  readonly weather: WeatherName | undefined
  /** The player names the intro showed; a player line after the start changes none. */
  readonly players: Readonly<Partial<Record<Side, string>>>
}

export interface RuleInput<K extends Protocol.BattleArgName> {
  readonly line: number
  readonly args: Protocol.Args[K]
  readonly kwArgs: Protocol.KWArgs[K]
  /** The client after it added the line. */
  readonly battle: Battle
  readonly before: Before
}

interface Rule<K extends Protocol.BattleArgName> {
  /** How many positional arguments after the name the rule reads. */
  readonly arity: number
  /** The keyword arguments the rule maps. */
  readonly reads: readonly (keyof Protocol.KWArgs[K])[]
  build(input: RuleInput<K>): ScriptEvent[]
}

export type Rules = { readonly [K in Protocol.BattleArgName]?: Rule<K> }

/** A rule seen from the build loop, which holds lines of every kind. */
interface AnyRule {
  readonly arity: number
  readonly reads: readonly string[]
  build(input: RuleInput<Protocol.BattleArgName>): ScriptEvent[]
}

const RULES: Readonly<Partial<Record<string, AnyRule>>> = {
  ...BATTLE_RULES,
  ...POKEMON_RULES,
  ...MOVE_RULES,
  ...EFFECT_RULES,
  ...FIELD_RULES,
}

/** The rule for a protocol key, if the battle script shows that kind of line. */
export function ruleFor(key: Protocol.ArgName): AnyRule | undefined {
  return RULES[key]
}

/** What a line carries beyond its rule, or undefined when the rule reads all of it. */
export function unreadPart(rule: AnyRule, line: LogLine): string | undefined {
  const args: readonly unknown[] = line.args
  const arg = args.slice(1 + rule.arity).find((value) => value !== '')
  if (arg !== undefined) {
    return `positional argument ${JSON.stringify(arg)}`
  }
  const name = Object.keys(line.kwArgs).find((key) => !rule.reads.includes(key))
  return name === undefined ? undefined : `keyword argument [${name}]`
}

/** Runs a rule on a line it has read in full. */
export function eventsOf(
  rule: AnyRule,
  line: LogLine,
  battle: Battle,
  before: Before,
): ScriptEvent[] {
  // The key picked the rule, so the line's args and kwArgs have the types the rule expects.
  const args = line.args as Protocol.Args[Protocol.BattleArgName]
  return rule.build({ line: line.index, args, kwArgs: line.kwArgs, battle, before })
}
