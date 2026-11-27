// The not-shown list of a Gen 5 replay (#110, lane plan D12): every fallback counted by the
// issue that plays it (`#110`, the one left since #109) or by its kind (`line`, `plain`, and the
// party's `form`, `character`, `moves` and `game`), then by the event's kind, or `party` for the
// party's. The run's log and the replay spec read the same list.
import type { Gen5Fallback } from './fallbacks.ts'

/** Counts by issue or kind, then by event kind. */
export type NotShown = Record<string, Record<string, number>>

/** The not-shown list of `fallbacks`. */
export function notShown(fallbacks: readonly Gen5Fallback[]): NotShown {
  const counts: NotShown = {}
  for (const one of fallbacks) {
    const by = one.kind === 'later' ? one.detail.replace('plays with ', '') : one.kind
    const what = 'event' in one ? one.event : 'party'
    const of = (counts[by] ??= {})
    of[what] = (of[what] ?? 0) + 1
  }
  return counts
}
