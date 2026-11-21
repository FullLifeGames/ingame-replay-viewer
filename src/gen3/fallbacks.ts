// The fallbacks of plan "Fallbacks": what the game shows in place of content it lacks. The backend
// lists each one with its log line beside the battle script's dropped lines.
import type { Found } from './tables/lookup'
import type { CharacterFallback } from './text/charset'
import type { Phrase } from './text/template'

/** A fallback as a lookup or a phrase reports it, before the backend gives it its line. */
export type Noted =
  NonNullable<Found['fallback']> | CharacterFallback | NonNullable<Phrase['fallback']>

export interface Fallback {
  readonly line: number
  readonly kind: Noted['kind']
  readonly detail: string
}
