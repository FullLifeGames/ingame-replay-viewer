// The fallbacks of the Gen 5 backend (#106): what the game shows in place of content it lacks or
// cannot hold. The backend lists each one with its log line beside the battle script's dropped
// lines, as the Gen 3 backend does (src/gen3/fallbacks.ts).

/**
 * `form`: a forme the party writes as form 0, the species' base form. `character`: a character
 * of a name that the battle's font lacks, which shows as "?". `moves`: a move the log reveals past
 * the four a Pokémon holds.
 */
type Gen5FallbackKind = 'form' | 'character' | 'moves'

export interface Gen5Fallback {
  readonly line: number
  readonly kind: Gen5FallbackKind
  readonly detail: string
}

/** The fallbacks in line order; fallbacks of one line keep their order. */
export const inLineOrder = (fallbacks: readonly Gen5Fallback[]): Gen5Fallback[] =>
  [...fallbacks].sort((a, b) => a.line - b.line)
