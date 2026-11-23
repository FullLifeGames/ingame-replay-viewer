import { lineNumber } from './lines'

/**
 * A battle log the battle script cannot follow: a game type other than singles, a Pokémon the
 * log never brought in, an HP string that does not parse. The message starts with the line's
 * number, counted from 1 (lineNumber).
 */
export class ScriptError extends Error {
  override name = 'ScriptError'
  /** 0-based index of the battle log line that failed. */
  readonly line: number

  constructor(line: number, reason: string, options?: ErrorOptions) {
    super(`line ${String(lineNumber(line))}: ${reason}`, options)
    this.line = line
  }
}

/** A battle log whose game type is not singles; carries the game type from its `|gametype|` line. */
export class GameTypeRefusal extends ScriptError {
  override name = 'GameTypeRefusal'
  readonly gameType: string

  constructor(line: number, gameType: string) {
    super(line, `the game type "${gameType}" is not singles`)
    this.gameType = gameType
  }
}
