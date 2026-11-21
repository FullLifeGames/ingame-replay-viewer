// A replay on its way into the game: its battle script and instruction stream, and the list of
// what the game does not show (plan "No silent drops"): the battle script's dropped lines and the
// backend's fallbacks, by log line.
import { buildGen3Stream, type Gen3Stream } from '../gen3/backend'
import { showsInPlace, type Fallback } from '../gen3/fallbacks'
import { buildBattleScript } from '../script/build'
import { readLines, type LogLine } from '../script/lines'
import { readReplay, type Replay } from '../script/replay'

export interface ReplayStream {
  readonly replay: Replay
  readonly stream: Gen3Stream
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
 * The instruction stream of a parsed replay JSON. A `ReplayError`, `ScriptError` or `Gen3Error`
 * passes through with its message.
 */
export function streamOfReplay(json: unknown): ReplayStream {
  const replay = readReplay(json)
  return { replay, stream: buildGen3Stream(buildBattleScript(replay.log)) }
}

const withDetail = (detail: string | undefined) => (detail === undefined ? {} : { detail })

function lineText(lines: readonly LogLine[], fallback: Fallback): string {
  const line = lines[fallback.line]
  if (line === undefined) {
    throw new Error(`a fallback points at line ${String(fallback.line)}, past the battle log's end`)
  }
  return line.text
}

/** Every dropped line and fallback of `stream`, in log order. */
export function notShown(replay: Replay, stream: Gen3Stream): NotShownRow[] {
  const lines = readLines(replay.log)
  const dropped = stream.dropped.map(({ line, reason, text, detail }): NotShownRow => ({
    line: line + 1,
    what: `dropped: ${reason}`,
    text,
    ...withDetail(detail),
    standIn: false,
  }))
  const fallbacks = stream.fallbacks.map((fallback): NotShownRow => ({
    line: fallback.line + 1,
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
