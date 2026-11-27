// The Gen 5 page's list of what Black 2 does not show (#111): every dropped line of the battle
// script and every fallback of the Gen 5 backend, by the log line an editor counts from 1, in line
// order, as the Gen 3 page lists its own (src/web/stream.ts). The heading, the counts and the
// rows' words are the Gen 3 page's, imported as they are (lane plan D10). The Gen 5 page shows no
// stand-in, so no row says one shows (D16). No DOM: not-shown-view.ts writes the list.
import type { Gen5Fallback } from '../../gen5/backend/fallbacks.ts'
import type { Gen5Replay } from '../../gen5/backend/replay.ts'
import { lineNumber } from '../../script/lines.ts'
import { countText, notShownHeading, rowParts, type RowParts } from '../status.ts'
import { notShownCounts, type NotShownRow } from '../stream.ts'

/** The list as the page writes it: the heading, one text per count, the rows in parts. */
export interface NotShownList {
  readonly heading: string
  readonly counts: readonly string[]
  readonly rows: readonly RowParts[]
}

const withDetail = (detail: string | undefined) => (detail === undefined ? {} : { detail })

function lineText(lines: readonly string[], fallback: Gen5Fallback): string {
  const text = lines[fallback.line]
  if (text === undefined) {
    throw new Error(
      `a fallback points at line ${String(lineNumber(fallback.line))}, past the battle log's end`,
    )
  }
  return text
}

/** Every dropped line and fallback of `replay`, in line order; `lines` is the log by line. */
export function notShownRows(
  replay: Pick<Gen5Replay, 'dropped' | 'fallbacks'>,
  lines: readonly string[],
): NotShownRow[] {
  const dropped = replay.dropped.map(({ line, reason, text, detail }): NotShownRow => ({
    line: lineNumber(line),
    what: `dropped: ${reason}`,
    text,
    ...withDetail(detail),
    standIn: false,
  }))
  const fallbacks = replay.fallbacks.map((fallback): NotShownRow => ({
    line: lineNumber(fallback.line),
    what: `fallback: ${fallback.kind}`,
    text: lineText(lines, fallback),
    detail: fallback.detail,
    standIn: false,
  }))
  return [...dropped, ...fallbacks].sort((a, b) => a.line - b.line)
}

/** The heading, the counts and the rows of `rows` in the Gen 3 page's words. */
export function notShownList(rows: readonly NotShownRow[]): NotShownList {
  return {
    heading: notShownHeading(rows.length),
    counts: notShownCounts(rows).map(countText),
    rows: rows.map(rowParts),
  }
}
