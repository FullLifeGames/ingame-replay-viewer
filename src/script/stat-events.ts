// The battle script's events about stat stages. `events.ts` gathers them into `ScriptEvent`.

import type { BoostID } from '@pkmn/data'

import type { Effect, PokemonRef } from './types'

export interface StatChangeEvent {
  readonly kind: 'statChange'
  readonly line: number
  readonly who: PokemonRef
  readonly stat: BoostID
  /** Signed and never 0: a raise is positive, a drop negative. */
  readonly stages: number
  readonly cause?: Effect
}

/** A raise at +6 or a drop at -6: the log's change of 0 stages, with its direction kept. */
export interface StatLimitEvent {
  readonly kind: 'statLimit'
  readonly line: number
  readonly who: PokemonRef
  readonly stat: BoostID
  readonly direction: 'up' | 'down'
  readonly cause?: Effect
}

/** Every stat stage of every active Pokémon back to 0 (Haze). */
export interface StatResetEvent {
  readonly kind: 'statReset'
  readonly line: number
}

/** The lowered stat stages of one Pokémon back to 0 (White Herb); its raised ones stay. */
export interface NegativeStatResetEvent {
  readonly kind: 'negativeStatReset'
  readonly line: number
  readonly who: PokemonRef
  /** By stat, the stages each lowered stat climbs to reach 0; always positive. */
  readonly restored: Readonly<Partial<Record<BoostID, number>>>
  readonly silent?: true
}
