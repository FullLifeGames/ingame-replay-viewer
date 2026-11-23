// A replay on its way into the game: its battle script and instruction stream, and the list of
// what the game does not show (plan "No silent drops"): the battle script's dropped lines and the
// backend's fallbacks, by log line. The names of the two players come from the battle script too.
import { buildGen3Stream, type Gen3Stream } from '../gen3/backend'
import { showsInPlace, type Fallback } from '../gen3/fallbacks'
import { buildBattleScript } from '../script/build'
import type { ScriptEvent } from '../script/events'
import { lineNumber, readLines, type LogLine } from '../script/lines'
import { readReplay, type Replay } from '../script/replay'
import type { Side } from '../script/types'

export interface ReplayStream {
  readonly replay: Replay
  readonly stream: Gen3Stream
  /** The players by side, as the log's intro names them; player 1 is the near side. */
  readonly players: Readonly<Record<Side, string>>
}

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

/**
 * The instruction stream of a replay read from JSON or from a saved file (#56). A `ScriptError`
 * or `Gen3Error` passes through with its message.
 */
export function streamOfLoaded(replay: Replay): ReplayStream {
  const script = buildBattleScript(replay.log)
  return { replay, stream: buildGen3Stream(script), players: playersOf(script.events) }
}

/**
 * The first name the battle script's `player` events give each side. The backend refuses a log
 * that names no player for a side, so a stream always carries both names.
 */
function playersOf(events: readonly ScriptEvent[]): Record<Side, string> {
  const players: Record<Side, string> = { near: '', far: '' }
  for (const event of events.toReversed()) {
    if (event.kind === 'player') players[event.side] = event.name
  }
  return players
}

/** The instruction stream of a parsed replay JSON; a `ReplayError` passes through as well. */
export function streamOfReplay(json: unknown): ReplayStream {
  return streamOfLoaded(readReplay(json))
}

const withDetail = (detail: string | undefined) => (detail === undefined ? {} : { detail })

function lineText(lines: readonly LogLine[], fallback: Fallback): string {
  const line = lines[fallback.line]
  if (line === undefined) {
    throw new Error(
      `a fallback points at line ${String(lineNumber(fallback.line))}, past the battle log's end`,
    )
  }
  return line.text
}

/** Every dropped line and fallback of `stream`, in log order. */
export function notShown(replay: Replay, stream: Gen3Stream): NotShownRow[] {
  const lines = readLines(replay.log)
  const dropped = stream.dropped.map(({ line, reason, text, detail }): NotShownRow => ({
    line: lineNumber(line),
    what: `dropped: ${reason}`,
    text,
    ...withDetail(detail),
    standIn: false,
  }))
  const fallbacks = stream.fallbacks.map((fallback): NotShownRow => ({
    line: lineNumber(fallback.line),
    what: `fallback: ${fallback.kind}`,
    text: lineText(lines, fallback),
    detail: fallback.detail,
    standIn: showsInPlace(fallback),
  }))
  return [...dropped, ...fallbacks].sort((a, b) => a.line - b.line)
}

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
