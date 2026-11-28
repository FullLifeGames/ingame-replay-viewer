// The fallbacks of plan "Fallbacks": what the game shows in place of content it lacks. The backend
// lists each one with its log line beside the battle script's dropped lines.
import type { Found } from './tables/lookup'
import type { CharacterFallback } from './text/charset'
import type { Phrase } from './text/template'

/**
 * A mechanic the stream holds no state for. On a silent line nothing shows in its place; on a line
 * that prints, the text shows and the look the stream lacks does not (a Tera type the game lacks).
 */
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

/** `effect` at `phase` ("starting", "ending"), which the stream cannot hold. */
export function mechanicGap(effect: string, phase: string): MechanicFallback {
  return { kind: 'mechanic', detail: `no state in the stream for ${effect} ${phase}` }
}

/** A Terastallization into `type`, which the game has no `TYPE_*` for: the lines show alone. */
export function teraTypeGap(type: string): MechanicFallback {
  return { kind: 'mechanic', detail: `the game has no Tera type ${type}` }
}

/**
 * Illusion's end, which the game plays as a morph of the sprite in place (`B_ANIM_ILLUSION_OFF`)
 * and the stream as a switch: the disguise goes back and the real Pokémon comes in (#98).
 */
export function illusionGap(): MechanicFallback {
  return { kind: 'mechanic', detail: "Illusion's end, which the game plays as a switch" }
}

/**
 * A look of `move` that the log names (`[anim] Shell Side Arm Physical`) and the game lacks: the
 * MOVE op carries the move alone, so the game plays the move's own animation. A look by type
 * (`[anim] Ivy Cudgel Water`) is none: its MOVE_TYPE gives the game the type (#89).
 */
export function animGap(look: string, move: string): NonNullable<Found['fallback']> {
  return { kind: 'move', detail: `the game has no look for ${look}; it plays ${move}` }
}

export interface Fallback {
  readonly line: number
  readonly kind: Noted['kind']
  readonly detail: string
}

/**
 * Whether the game shows something in place of `fallback`'s content gap: a phrase, a character, a
 * form, a move, an ability or an item. A mechanic the game lacks is a content gap too, but nothing
 * shows in its place either way, so a test replay may list it.
 */
export const showsInPlace = (fallback: Fallback): boolean => fallback.kind !== 'mechanic'
