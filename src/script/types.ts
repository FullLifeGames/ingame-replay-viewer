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
