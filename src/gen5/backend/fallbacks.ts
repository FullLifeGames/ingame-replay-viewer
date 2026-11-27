// The fallbacks of the Gen 5 backend (#106, #107): what the game shows in place of content it lacks
// or cannot hold, and each event that does not play yet. The backend lists each one with its log
// line beside the battle script's dropped lines, as the Gen 3 backend does (src/gen3/fallbacks.ts).
import type { ScriptEvent } from '../../script/events.ts'

/**
 * `form`: a forme the party writes as form 0, the species' base form. `character`: a character
 * of a name that the battle's font lacks, which shows as "?". `moves`: a move the log reveals past
 * the four a Pokémon holds.
 */
interface TeamFallback {
  readonly line: number
  readonly kind: 'form' | 'character' | 'moves'
  readonly detail: string
}

/** `later`: an event that a later issue plays, named in `detail`. `line`: a line that Black 2 has
 * no message for, so nothing shows for it. `event` is the battle script's kind of the event. */
interface EventFallback {
  readonly line: number
  readonly kind: 'later' | 'line'
  readonly event: ScriptEvent['kind']
  readonly detail: string
}

export type Gen5Fallback = TeamFallback | EventFallback

/** The fallback of an event that plays with issue `issue`. */
export const laterFallback = (event: ScriptEvent, issue: number): Gen5Fallback => ({
  line: event.line,
  kind: 'later',
  event: event.kind,
  detail: `plays with #${String(issue)}`,
})

/** The fallback of an event whose line Black 2 lacks. */
export const lineFallback = (event: ScriptEvent, detail: string): Gen5Fallback => ({
  line: event.line,
  kind: 'line',
  event: event.kind,
  detail,
})

/** The fallbacks in line order; fallbacks of one line keep their order. */
export const inLineOrder = (fallbacks: readonly Gen5Fallback[]): Gen5Fallback[] =>
  [...fallbacks].sort((a, b) => a.line - b.line)
