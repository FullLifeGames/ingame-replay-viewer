// The words of the pages' "Not shown in the game" list, game-neutral: a row of a dropped line or
// a fallback, the counts by what happened, the heading and each row in parts. The Gen 3 pages and
// the Gen 5 page import them from here, so the Gen 5 page's bundle holds no Gen 3 backend (#111,
// lane plan D10). Each page builds its own rows: src/web/stream.ts and src/web/gen5/not-shown.ts.
import { lineNumber } from '../script/lines'
import type { DroppedLine } from '../script/types'
import { plainText } from './markup'

/** One row of the page's "Not shown in the game" list. */
export interface NotShownRow {
  /** 1-based, as an editor counts the battle log's lines. */
  readonly line: number
  /** `dropped: <reason>` or `fallback: <kind>`. */
  readonly what: string
  /** The battle log line. */
  readonly text: string
  /** What the battle script left unread, or what the fallback replaced. */
  readonly detail?: string
  /** Whether the game shows a stand-in for the content (a fallback that `showsInPlace`). */
  readonly standIn: boolean
}

export interface NotShownCount {
  readonly what: string
  readonly count: number
}

/** A backend's fallback as the list reads it: its 0-based log line, its kind and its detail. */
export interface ListedFallback {
  readonly line: number
  readonly kind: string
  readonly detail: string
}

const withDetail = (detail: string | undefined) => (detail === undefined ? {} : { detail })

/** The row of a line the battle script dropped. */
export const droppedRow = ({ line, reason, text, detail }: DroppedLine): NotShownRow => ({
  line: lineNumber(line),
  what: `dropped: ${reason}`,
  text,
  ...withDetail(detail),
  standIn: false,
})

/** The row of `fallback`; `text` is its log line, undefined past the battle log's end. */
export function fallbackRow(
  fallback: ListedFallback,
  text: string | undefined,
  standIn: boolean,
): NotShownRow {
  const line = lineNumber(fallback.line)
  if (text === undefined) {
    throw new Error(`a fallback points at line ${String(line)}, past the battle log's end`)
  }
  return { line, what: `fallback: ${fallback.kind}`, text, detail: fallback.detail, standIn }
}

/** The rows in line order; a line's dropped row comes before its fallbacks. */
export const inLineOrder = (
  dropped: readonly NotShownRow[],
  fallbacks: readonly NotShownRow[],
): NotShownRow[] => [...dropped, ...fallbacks].sort((a, b) => a.line - b.line)

/** The rows per `what`, the largest count first, equal counts by name. */
export function notShownCounts(rows: readonly NotShownRow[]): NotShownCount[] {
  const counts = new Map<string, number>()
  for (const { what } of rows) {
    counts.set(what, (counts.get(what) ?? 0) + 1)
  }
  return [...counts]
    .map(([what, count]) => ({ what, count }))
    .sort((a, b) => b.count - a.count || a.what.localeCompare(b.what))
}

export const notShownHeading = (rows: number): string => `Not shown in the game (${String(rows)})`

export const countText = ({ what, count }: NotShownCount): string => `${what} (${String(count)})`

/** A "Not shown" row in three parts; the page keeps `kind` on one line (#90). */
export interface RowParts {
  readonly head: string
  /** The log line's first field, such as "|-fieldstart", or '' for a line without one. */
  readonly kind: string
  readonly rest: string
}

/**
 * The longest first field a row keeps on one line, as long as the protocol's longest. A longer
 * one, which only someone else's replay holds, wraps with the rest: 24 wide glyphs pass a 390 px
 * phone's width (#90).
 */
const LONGEST_KIND = 20

/**
 * One row of the list in parts: its 1-based line and what happened, then the log line's first
 * field, then the rest of the log line and any detail, the log line and the detail without
 * Showdown's markup (#31). A first field longer than any of the protocol stays in the rest.
 */
export function rowParts({ line, what, text, detail, standIn }: NotShownRow): RowParts {
  const shown = standIn ? `${what}, a stand-in shows` : what
  const logLine = plainText(text)
  const field = /^\|[^|]*/.exec(logLine)?.[0] ?? ''
  const kind = field.length <= LONGEST_KIND ? field : ''
  const tail = detail === undefined ? '' : `; ${plainText(detail)}`
  return {
    head: `Line ${String(line)}, ${shown}${text === '' ? '' : ': '}`,
    kind,
    rest: `${logLine.slice(kind.length)}${tail}`,
  }
}

/** One row of the list as one text: its parts joined. */
export function rowText(row: NotShownRow): string {
  const { head, kind, rest } = rowParts(row)
  return `${head}${kind}${rest}`
}
