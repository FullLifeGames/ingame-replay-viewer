// The battle script's events for the effects on one Pokémon, items and abilities. `events.ts`
// holds the other events and the union of them all.

import type { TypeName } from '@pkmn/data'

import type { Caused, Hit } from './events'
import type { Effect, PokemonRef } from './types'

export interface EffectStartEvent extends Caused {
  readonly kind: 'effectStart'
  readonly line: number
  readonly who: PokemonRef
  readonly effect: Effect
  /** What the effect names beside it, such as the move Disable disabled. */
  readonly detail?: string
  readonly silent?: true
}

/** A Substitute that breaks is a hit. */
export interface EffectEndEvent extends Caused, Hit {
  readonly kind: 'effectEnd'
  readonly line: number
  readonly who: PokemonRef
  readonly effect: Effect
  readonly silent?: true
}

/**
 * A Substitute that takes a hit is one (`[damage]`). Splash's `|-nothing` is one on no Pokémon:
 * the parser reads it as `-activate||move: Splash`, and the game says "But nothing happened!".
 * An item that acts as it is used up carries `[consumed]` (Custap Berry, after its `[eat]`).
 */
export interface EffectActivateEvent extends Hit {
  readonly kind: 'effectActivate'
  readonly line: number
  readonly who?: PokemonRef
  readonly effect: Effect
  readonly damage?: true
  readonly consumed?: true
}

/** `who` turns into a copy of `into` (Transform). */
export interface TransformEvent {
  readonly kind: 'transform'
  readonly line: number
  readonly who: PokemonRef
  readonly into: PokemonRef
}

/**
 * `who` takes the form `species` until it leaves the field (Castform's Forecast); `msg` marks a
 * line the client shows with its message.
 */
export interface FormChangeEvent extends Caused {
  readonly kind: 'formChange'
  readonly line: number
  readonly who: PokemonRef
  readonly species: string
  readonly msg?: true
}

/** `who` terastallizes into `type`, the type the log names (#88). */
export interface TerastallizeEvent {
  readonly kind: 'terastallize'
  readonly line: number
  readonly who: PokemonRef
  readonly type: TypeName
}

/** An effect that lasts the turn: Protect, Endure, Focus Punch's focus. */
export interface SingleTurnEvent {
  readonly kind: 'singleTurn'
  readonly line: number
  readonly who: PokemonRef
  readonly effect: Effect
}

/** An effect that lasts until its user's next move: Destiny Bond, Grudge, Rage. */
export interface SingleMoveEvent {
  readonly kind: 'singleMove'
  readonly line: number
  readonly who: PokemonRef
  readonly effect: Effect
}

/** `who` takes the stat stages of `from` (Psych Up). */
export interface CopyBoostEvent extends Caused {
  readonly kind: 'copyBoost'
  readonly line: number
  readonly who: PokemonRef
  readonly from: PokemonRef
}

export interface ItemEvent extends Caused {
  readonly kind: 'item'
  readonly line: number
  readonly who: PokemonRef
  readonly item: string
}

export interface ItemEndEvent extends Caused {
  readonly kind: 'itemEnd'
  readonly line: number
  readonly who: PokemonRef
  readonly item: string
  /** A berry eaten (`[eat]`). */
  readonly eaten?: true
  readonly silent?: true
}

export interface AbilityEvent extends Caused {
  readonly kind: 'ability'
  readonly line: number
  readonly who: PokemonRef
  readonly ability: string
  /** What the ability did, such as `boost` for Intimidate. */
  readonly detail?: string
}
