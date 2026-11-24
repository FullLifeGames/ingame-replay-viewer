// The presentation events of the battle script. Every event starts with `kind`, then `line`:
// the index of the battle log line it came from. Fields a line does not carry stay absent.

import type { WeatherName } from '@pkmn/client'
import type { BoostID, StatusName } from '@pkmn/data'

import type {
  AbilityEvent,
  EffectActivateEvent,
  EffectEndEvent,
  EffectStartEvent,
  ItemEndEvent,
  ItemEvent,
  CopyBoostEvent,
  SingleMoveEvent,
  SingleTurnEvent,
  TransformEvent,
} from './effect-events'
import type { DroppedLine, Effect, HpFraction, PokemonRef, Side, TeamMember } from './types'

/** What `[from]` and `[of]` name: the effect behind a line and the Pokémon it came from. */
export interface Caused {
  readonly cause?: Effect
  readonly source?: PokemonRef
}

/** `super` for a super effective hit, `resisted` for a not very effective one. */
type Effectiveness = 'super' | 'resisted'

/** A hit takes the critical hit and effectiveness lines before it (plan D1, `hits.ts`). */
export interface Hit {
  readonly crit?: true
  readonly effectiveness?: Effectiveness
  /** The lines of the modifiers this hit absorbed. */
  readonly folded?: readonly number[]
}

interface PlayerEvent {
  readonly kind: 'player'
  readonly line: number
  readonly side: Side
  readonly name: string
  readonly avatar?: string
  readonly rating?: number
}

interface TeamSizeEvent {
  readonly kind: 'teamSize'
  readonly line: number
  readonly side: Side
  readonly size: number
}

interface BattleStartEvent {
  readonly kind: 'battleStart'
  readonly line: number
}

interface TurnEvent {
  readonly kind: 'turn'
  readonly line: number
  readonly number: number
}

interface SwitchInEvent {
  readonly kind: 'switchIn'
  readonly line: number
  readonly who: PokemonRef
  /** The Pokémon it sends back; absent when the slot was empty after a faint. */
  readonly replaces?: PokemonRef
  /** Forced in by a move such as Roar (`|drag|`). */
  readonly dragged: boolean
  /** Baton Pass, from `[from]`. */
  readonly cause?: Effect
  readonly hp: HpFraction
  readonly status?: StatusName
}

interface FaintEvent {
  readonly kind: 'faint'
  readonly line: number
  readonly who: PokemonRef
}

/** A text line of the simulator's own, such as a forfeit. */
interface SimulatorMessageEvent {
  readonly kind: 'message'
  readonly line: number
  readonly text: string
}

interface WinEvent {
  readonly kind: 'win'
  readonly line: number
  /** Absent when the name matches neither player of the intro. */
  readonly side?: Side
  readonly name: string
}

interface TieEvent {
  readonly kind: 'tie'
  readonly line: number
}

interface MoveEvent {
  readonly kind: 'move'
  readonly line: number
  readonly user: PokemonRef
  readonly move: string
  readonly target?: PokemonRef
  /** The move or effect that called this one, such as Sleep Talk (`[from]`). */
  readonly calledBy?: Effect
  readonly miss?: true
  /** No animation (`[still]`). */
  readonly still?: true
  readonly notarget?: true
}

interface CantEvent {
  readonly kind: 'cant'
  readonly line: number
  readonly who: PokemonRef
  readonly reason: Effect
  readonly move?: string
}

interface MissEvent {
  readonly kind: 'miss'
  readonly line: number
  readonly user: PokemonRef
  readonly target?: PokemonRef
}

/** A one-hit KO move's knockout, after its hit. */
interface OhkoEvent {
  readonly kind: 'ohko'
  readonly line: number
}

/** A move that fails for want of a target; Gen 1's line names no Pokémon. */
interface NoTargetEvent {
  readonly kind: 'noTarget'
  readonly line: number
  readonly who?: PokemonRef
}

interface ImmuneEvent extends Caused {
  readonly kind: 'immune'
  readonly line: number
  readonly who: PokemonRef
  /** What the Pokémon is immune to, where the line names it (Own Tempo's `confusion`). */
  readonly effect?: Effect
}

interface FailEvent extends Caused {
  readonly kind: 'fail'
  readonly line: number
  readonly who: PokemonRef
  /** What failed: a status (`par`), `unboost`, a move. */
  readonly effect?: Effect
  /** The stat an `unboost` failure kept, as @pkmn/protocol gives it (`atk`). */
  readonly stat?: string
  /** Too little HP for the move (`[weak]`); in Gen 3, a Substitute's failure. */
  readonly weak?: true
}

interface BlockEvent {
  readonly kind: 'block'
  readonly line: number
  readonly who: PokemonRef
  readonly effect: Effect
  readonly move?: string
  readonly source?: PokemonRef
}

/** A move's HP change and the other HP changes of a turn. */
interface HpChange extends Caused {
  readonly line: number
  readonly who: PokemonRef
  readonly hp: HpFraction
  readonly status?: StatusName
  /** No text of its own; the HP bar still moves. */
  readonly silent?: true
}

interface DamageEvent extends HpChange, Hit {
  readonly kind: 'damage'
}

interface HealEvent extends HpChange {
  readonly kind: 'heal'
  /** Whose Wish came true. */
  readonly wisher?: PokemonRef
}

interface StatusEvent extends Caused {
  readonly kind: 'status'
  readonly line: number
  readonly who: PokemonRef
  readonly status: StatusName
}

interface CureStatusEvent {
  readonly kind: 'cureStatus'
  readonly line: number
  readonly who: PokemonRef
  readonly status: StatusName
  readonly cause?: Effect
  readonly silent?: true
  /** The cure shows the status's own message (`[msg]`). */
  readonly msg?: true
}

interface CureTeamEvent {
  readonly kind: 'cureTeam'
  readonly line: number
  readonly who: PokemonRef
  readonly cause?: Effect
}

interface StatChangeEvent {
  readonly kind: 'statChange'
  readonly line: number
  readonly who: PokemonRef
  readonly stat: BoostID
  /** Signed and never 0: a raise is positive, a drop negative. */
  readonly stages: number
  readonly cause?: Effect
}

/** A raise at +6 or a drop at -6: the log's change of 0 stages, with its direction kept. */
interface StatLimitEvent {
  readonly kind: 'statLimit'
  readonly line: number
  readonly who: PokemonRef
  readonly stat: BoostID
  readonly direction: 'up' | 'down'
  readonly cause?: Effect
}

/** Every stat stage of every active Pokémon back to 0 (Haze). */
interface StatResetEvent {
  readonly kind: 'statReset'
  readonly line: number
}

/** A critical hit that no hit absorbed. */
interface CritEvent {
  readonly kind: 'crit'
  readonly line: number
  readonly who: PokemonRef
}

/** An effectiveness line that no hit absorbed. */
interface EffectivenessEvent {
  readonly kind: 'effectiveness'
  readonly line: number
  readonly who: PokemonRef
  readonly effectiveness: Effectiveness
}

/** Showdown's `-hitcount` after a multi-hit move's last hit; `who` is the move's target. */
interface HitCountEvent {
  readonly kind: 'hitCount'
  readonly line: number
  readonly who: PokemonRef
  readonly hits: number
}

interface WeatherEvent extends Caused {
  readonly kind: 'weather'
  readonly line: number
  readonly weather: WeatherName
  readonly phase: 'start' | 'upkeep' | 'end'
}

/** An entry hazard or another condition on one side of the field. */
interface SideConditionEvent extends Caused {
  readonly kind: 'sideStart' | 'sideEnd'
  readonly line: number
  readonly side: Side
  readonly condition: Effect
}

interface FieldActivateEvent {
  readonly kind: 'fieldActivate'
  readonly line: number
  readonly effect: Effect
}

export type ScriptEvent =
  | PlayerEvent
  | TeamSizeEvent
  | BattleStartEvent
  | TurnEvent
  | SwitchInEvent
  | FaintEvent
  | SimulatorMessageEvent
  | WinEvent
  | TieEvent
  | MoveEvent
  | CantEvent
  | MissEvent
  | OhkoEvent
  | NoTargetEvent
  | ImmuneEvent
  | FailEvent
  | BlockEvent
  | DamageEvent
  | HealEvent
  | StatusEvent
  | CureStatusEvent
  | CureTeamEvent
  | StatChangeEvent
  | StatLimitEvent
  | StatResetEvent
  | CritEvent
  | EffectivenessEvent
  | HitCountEvent
  | EffectStartEvent
  | EffectEndEvent
  | EffectActivateEvent
  | TransformEvent
  | SingleTurnEvent
  | SingleMoveEvent
  | CopyBoostEvent
  | WeatherEvent
  | SideConditionEvent
  | FieldActivateEvent
  | ItemEvent
  | ItemEndEvent
  | AbilityEvent

/** The battle script of one battle log. */
export interface BattleScript {
  readonly gen: number
  /** The format as `|tier|` names it, such as `[Gen 3] OU`. */
  readonly format: string
  readonly teams: Readonly<Record<Side, readonly TeamMember[]>>
  /** In log order. */
  readonly events: readonly ScriptEvent[]
  /** In log order. */
  readonly dropped: readonly DroppedLine[]
}
