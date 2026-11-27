// The Gen 5 page's list of what Black 2 does not show (#111): every dropped line of the battle
// script and every fallback of the Gen 5 backend, by the log line an editor counts from 1, in line
// order, as the Gen 3 page lists its own (src/web/stream.ts). The rows, the heading and the counts
// come from the game-neutral src/web/not-shown-list.ts, which the Gen 3 pages share (lane plan
// D10 b). The Gen 5 page shows no stand-in, so no row says one shows (D16). No DOM:
// not-shown-view.ts writes the list.
import type { Gen5Replay } from '../../gen5/backend/replay.ts'
import {
  countText,
  droppedRow,
  fallbackRow,
  inLineOrder,
  notShownCounts,
  notShownHeading,
  type NotShownRow,
  rowParts,
  type RowParts,
} from '../not-shown-list.ts'

/** The list as the page writes it: the heading, one text per count, the rows in parts. */
export interface NotShownList {
  readonly heading: string
  readonly counts: readonly string[]
  readonly rows: readonly RowParts[]
}

/** Every dropped line and fallback of `replay`, in line order; `lines` is the log by line. */
export function notShownRows(
  replay: Pick<Gen5Replay, 'dropped' | 'fallbacks'>,
  lines: readonly string[],
): NotShownRow[] {
  return inLineOrder(
    replay.dropped.map(droppedRow),
    replay.fallbacks.map((fallback) => fallbackRow(fallback, lines[fallback.line], false)),
  )
}

/** The heading, the counts and the rows of `rows` in the pages' words. */
export function notShownList(rows: readonly NotShownRow[]): NotShownList {
  return {
    heading: notShownHeading(rows.length),
    counts: notShownCounts(rows).map(countText),
    rows: rows.map(rowParts),
  }
}
