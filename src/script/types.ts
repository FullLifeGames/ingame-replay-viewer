// The battle script (GLOSSARY): the game-neutral, ordered list of presentation events derived
// from a battle log, plus the lines it deliberately does not show (ADR 0004, "No silent drops").

import type { StatusName } from '@pkmn/data'

/**
 * Why a battle log line is a dropped line. `unknown` and `unsupported` mark lines the battle
 * script cannot show yet; no test replay may contain them.
 */
export type DropReason =
  | 'spacer'
  | 'timestamp'
  | 'chat'
  | 'timer'
  | 'rule'
  | 'metadata'
  | 'upkeep'
  | 'room'
  | 'hint'
  | 'unknown'
  | 'unsupported'

/** A battle log line that is not shown in the game, with the reason. */
export interface DroppedLine {
  readonly line: number
  readonly text: string
  readonly reason: DropReason
  /** What was left unread, for an `unsupported` line. */
  readonly detail?: string
}

/** Player 1 is the near side; a flipped view would change only `sideOf` in `refs.ts`. */
export type Side = 'near' | 'far'

/** A Pokémon as an index into `teams[side]`, in order of first appearance. */
export interface PokemonRef {
  readonly side: Side
  readonly index: number
}

/** HP on the log's own scale: `71/100` stays 71 of 100, `24/48` stays 24 of 48. */
export interface HpFraction {
  readonly hp: number
  readonly max: number
}

/** An effect as the log names it (`item: Leftovers`, `Sandstorm`). */
export interface Effect {
  readonly name: string
  readonly kind?: 'move' | 'item' | 'ability'
}

/** A revealed team member; members the log never shows count only in `teamSize`. */
export interface TeamMember {
  readonly species: string
  /** The nickname, or the species when the log gives none. */
  readonly name: string
  readonly gender?: 'M' | 'F'
  readonly level: number
  readonly shiny: boolean
}

// Every event starts with `kind`, then `line`: the index of the battle log line it came from.

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
  /** Absent when the name matches neither player. */
  readonly side?: Side
  readonly name: string
}

interface TieEvent {
  readonly kind: 'tie'
  readonly line: number
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
