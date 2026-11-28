// The fallbacks of the Gen 5 backend (#106 to #110): what the game shows in place of content
// it lacks or cannot hold, and each event that does not play yet or plays only in part. The backend
// lists each one with its log line beside the battle script's dropped lines, as the Gen 3 backend
// does (src/gen3/fallbacks.ts).
import type { ScriptEvent } from '../../script/events.ts'

/**
 * `form`: a forme the party writes as form 0, the species' base form. `character`: a character
 * of a name or a printed line that the battle's font lacks, which shows as "?". `moves`: a move
 * the log reveals past the four a Pokémon holds. `game`: what the game shows that the log does
 * not, as a lead's written ability that acts as it comes in (#109, lane plan D4).
 */
interface TeamFallback {
  readonly line: number
  readonly kind: 'form' | 'character' | 'moves' | 'game'
  readonly detail: string
}

/** `unplayed`: an event that Black 2 does not play yet (#110, lane plan D8). `line`: a line that
 * Black 2 has no message for and that neither prints nor plays, so nothing shows for it; a
 * message of the simulator, a winner and a tie print in the text box instead (#118), and an
 * empty message is a `line`. `plain`: a switch-in that plays as a plain switch or drag, and
 * `detail` names what of it does not show. `event` is the battle script's kind of the event. */
interface EventFallback {
  readonly line: number
  readonly kind: 'unplayed' | 'line' | 'plain'
  readonly event: ScriptEvent['kind']
  readonly detail: string
}

export type Gen5Fallback = TeamFallback | EventFallback

/** The fallback of an event that Black 2 does not play yet. */
export const unplayedFallback = (event: ScriptEvent): Gen5Fallback => ({
  line: event.line,
  kind: 'unplayed',
  event: event.kind,
  detail: 'Black 2 does not play this yet',
})

/** The fallback of an event whose line Black 2 lacks. */
export const lineFallback = (event: ScriptEvent, detail: string): Gen5Fallback => ({
  line: event.line,
  kind: 'line',
  event: event.kind,
  detail,
})

/** The fallback of a switch-in that plays as a plain one; `missing` is what does not show. */
export const plainFallback = (event: ScriptEvent, missing: string): Gen5Fallback => ({
  line: event.line,
  kind: 'plain',
  event: event.kind,
  detail: `plays as a plain switch: ${missing}`,
})

/** The fallbacks in line order; fallbacks of one line keep their order. */
export const inLineOrder = (fallbacks: readonly Gen5Fallback[]): Gen5Fallback[] =>
  [...fallbacks].sort((a, b) => a.line - b.line)
