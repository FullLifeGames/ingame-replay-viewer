/**
 * A battle log the battle script cannot follow: a game type other than singles, a Pokémon the
 * log never brought in, an HP string that does not parse. The message starts with the line.
 */
export class ScriptError extends Error {
  override name = 'ScriptError'
  /** 0-based index of the battle log line that failed. */
  readonly line: number

  constructor(line: number, reason: string, options?: ErrorOptions) {
    super(`line ${String(line)}: ${reason}`, options)
    this.line = line
  }
}
