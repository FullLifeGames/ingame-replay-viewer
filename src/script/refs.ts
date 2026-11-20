// How the battle script names sides, Pokémon, HP and effects. The only place that knows that
// player 1 is the near side.

import type { Battle, Side as ClientSide, Pokemon } from '@pkmn/client'
import type { StatusName } from '@pkmn/data'
import { Protocol } from '@pkmn/protocol'

import { ScriptError } from './errors'
import type { Effect, HpFraction, PokemonRef, Side } from './types'

const SIDES: Partial<Record<string, Side>> = { p1: 'near', p2: 'far' }

/** The side of a player (`p1`, `p2`) at log line `at`. */
export function sideOf(player: string, at: number): Side {
  const side = SIDES[player]
  if (side === undefined) {
    throw new ScriptError(at, `player ${player} has no side in a singles battle`)
  }
  return side
}

/** The side of a side the client tracks; `n` counts players from 0, `id` holds a name. */
function sideOfClient(side: ClientSide, at: number): Side {
  return sideOf(`p${String(side.n + 1)}`, at)
}

/** A Pokémon the client tracks, as its side and team index. */
export function refOfPokemon(pokemon: Pokemon, at: number): PokemonRef {
  return { side: sideOfClient(pokemon.side, at), index: pokemon.side.team.indexOf(pokemon) }
}

/**
 * The client's Pokémon for a log ident (`p2a: Fantasy Meadow`). The client hands back whoever
 * is active in the named slot, so the name is checked as well.
 */
export function pokemonOf(battle: Battle, ident: string, at: number): Pokemon {
  const pokemon = battle.getPokemon(ident as Protocol.PokemonIdent)
  if (pokemon?.name !== Protocol.parsePokemonIdent(ident as Protocol.PokemonIdent).name) {
    throw new ScriptError(at, `no Pokémon "${ident}" has appeared`)
  }
  return pokemon
}

/** The team member a log ident names. */
export function refOf(battle: Battle, ident: string, at: number): PokemonRef {
  return refOfPokemon(pokemonOf(battle, ident, at), at)
}

/** The team member an optional ident names; a move without a target gives `''` or `null`. */
export function refIfAny(
  battle: Battle,
  ident: string | undefined,
  at: number,
): PokemonRef | undefined {
  return ident === undefined || ident === '' || ident === 'null'
    ? undefined
    : refOf(battle, ident, at)
}

/** The side a side ident names (`p1: A Welcome Guest`). */
export function sideOfArg(ident: string, at: number): Side {
  return sideOf(ident.split(':', 1)[0] ?? '', at)
}

/** A count from the log (`|turn|12`, `|teamsize|p1|6`). */
export function numberOf(text: string, at: number): number {
  const value = Number(text)
  if (text === '' || !Number.isInteger(value)) {
    throw new ScriptError(at, `"${text}" is not a whole number`)
  }
  return value
}

interface Health {
  readonly hp: HpFraction
  readonly status?: StatusName
}

/**
 * HP and status from a log HP string (`71/100 par`, `0 fnt`). A faint gives no scale of its
 * own and takes `max` from the Pokémon's last known HP.
 */
export function healthOf(hpStatus: string, max: number, at: number): Health {
  // parseHealth leaves `hp` as given when it cannot read a number, so NaN marks that case.
  const health = Protocol.parseHealth(hpStatus as Protocol.PokemonHPStatus, {
    hp: Number.NaN,
    maxhp: max,
    hpcolor: '',
  })
  if (health === null || !Number.isFinite(health.hp)) {
    throw new ScriptError(at, `the HP string "${hpStatus}" does not parse`)
  }
  const hp = { hp: health.hp, max: health.maxhp }
  return health.status === undefined ? { hp } : { hp, status: health.status }
}

/** An effect from a log name such as `item: Leftovers`; a bare name has no kind. */
export function effectOf(name: string): Effect {
  const { name: effect, type } = Protocol.parseEffect(name)
  return type === undefined ? { name: effect } : { name: effect, kind: type }
}

interface CauseArgs {
  readonly from?: string | undefined
  readonly of?: string | undefined
}

interface Cause {
  readonly cause?: Effect
  readonly source?: PokemonRef
}

/** What `[from]` and `[of]` name, as fields to spread into an event. */
export function causeOf(kwArgs: CauseArgs, battle: Battle, at: number): Cause {
  const { from, of } = kwArgs
  return {
    ...(from ? { cause: effectOf(from) } : {}),
    ...(of ? { source: refOf(battle, of, at) } : {}),
  }
}

/** The flags among `names` that a line sets, such as `[miss]` or `[silent]`, as fields. */
export function flagsOf<K extends string>(
  kwArgs: Partial<Record<K, unknown>>,
  names: readonly K[],
): Partial<Record<K, true>> {
  const flags: Partial<Record<K, true>> = {}
  for (const name of names.filter((flag) => kwArgs[flag])) {
    flags[name] = true
  }
  return flags
}
