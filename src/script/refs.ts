// How the battle script names sides, Pokémon, HP and effects. The only place that knows that
// player 1 is the near side.

import type { Battle, Pokemon } from '@pkmn/client'
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

/** A Pokémon the client tracks, as its side and team index. */
export function refOfPokemon(pokemon: Pokemon, at: number): PokemonRef {
  // `side.n` counts players from 0; `side.id` holds the player's name instead.
  const player = `p${String(pokemon.side.n + 1)}`
  return { side: sideOf(player, at), index: pokemon.side.team.indexOf(pokemon) }
}

/**
 * The team member a log ident (`p2a: Fantasy Meadow`) names. The client hands back whoever is
 * active in the named slot, so the name is checked as well.
 */
export function refOf(battle: Battle, ident: string, at: number): PokemonRef {
  const pokemon = battle.getPokemon(ident as Protocol.PokemonIdent)
  if (pokemon?.name !== Protocol.parsePokemonIdent(ident as Protocol.PokemonIdent).name) {
    throw new ScriptError(at, `no Pokémon "${ident}" has appeared`)
  }
  return refOfPokemon(pokemon, at)
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
