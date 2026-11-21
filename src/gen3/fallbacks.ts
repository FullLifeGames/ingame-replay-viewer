// The fallbacks of plan "Fallbacks": what the game shows in place of content it lacks. The backend
// lists each one with its log line beside the battle script's dropped lines.
import type { Found } from './tables/lookup'
import type { CharacterFallback } from './text/charset'
import type { Phrase } from './text/template'

/** A mechanic the stream holds no state for, on a silent line: nothing shows in its place. */
interface MechanicFallback {
  readonly kind: 'mechanic'
  readonly detail: string
}

/** A fallback as a lookup or a phrase reports it, before the backend gives it its line. */
export type Noted =
  | NonNullable<Found['fallback']>
  | CharacterFallback
  | NonNullable<Phrase['fallback']>
  | MechanicFallback

/** `effect` at `phase` ("starting", "ending") of a silent line, which the stream cannot hold. */
export function mechanicGap(effect: string, phase: string): MechanicFallback {
  return { kind: 'mechanic', detail: `no state in the stream for ${effect} ${phase}` }
}

export interface Fallback {
  readonly line: number
  readonly kind: Noted['kind']
  readonly detail: string
}

/**
 * Whether the game shows something in place of `fallback`'s content gap: a phrase, a character, a
 * form, a move, an ability or an item. A mechanic the game lacks is a content gap too, but on a
 * silent line nothing shows either way, so a test replay may list it.
 */
export const showsInPlace = (fallback: Fallback): boolean => fallback.kind !== 'mechanic'
