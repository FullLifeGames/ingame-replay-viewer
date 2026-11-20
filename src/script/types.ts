// The battle script (GLOSSARY): the game-neutral, ordered list of presentation events derived
// from a battle log, plus the lines it deliberately does not show (ADR 0004, "No silent drops").

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
