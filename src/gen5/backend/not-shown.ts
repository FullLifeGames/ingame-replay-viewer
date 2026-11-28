// The not-shown list of a Gen 5 replay (#110, lane plan D12): every fallback counted by its kind
// (`unplayed`, `line`, `plain`, and the party's `form`, `character`, `moves` and `game`), then by
// the event's kind, or `party` for the party's and the printed lines' (#118): a printed line is no
// `line`, and a character of it that the font lacks counts under `character`. The run's log and
// the replay spec read the same list.
import type { Gen5Fallback } from './fallbacks.ts'

/** Counts by kind, then by event kind. */
export type NotShown = Record<string, Record<string, number>>

/** The not-shown list of `fallbacks`. */
export function notShown(fallbacks: readonly Gen5Fallback[]): NotShown {
  const counts: NotShown = {}
  for (const one of fallbacks) {
    const what = 'event' in one ? one.event : 'party'
    const of = (counts[one.kind] ??= {})
    of[what] = (of[what] ?? 0) + 1
  }
  return counts
}
