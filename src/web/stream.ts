// A replay on its way into the game: its battle script and instruction stream, and the list of
// what the game does not show (plan "No silent drops"): the battle script's dropped lines and the
// backend's fallbacks, by log line. The names of the two players and the teams of Team Preview
// come from the battle script too.
import { buildGen3Stream, type Gen3Stream } from '../gen3/backend'
import { showsInPlace } from '../gen3/fallbacks'
import { buildBattleScript } from '../script/build'
import type { ScriptEvent } from '../script/events'
import { readLines } from '../script/lines'
import { readReplay, type Replay } from '../script/replay'
import type { Preview, Side } from '../script/types'
import { droppedRow, fallbackRow, inLineOrder, type NotShownRow } from './not-shown-list'

export interface ReplayStream {
  readonly replay: Replay
  readonly stream: Gen3Stream
  /** The players by side, as the log's intro names them; player 1 is the near side. */
  readonly players: Readonly<Record<Side, string>>
  /** Both teams of Team Preview, for a log that holds it (#87). */
  readonly preview?: Preview
}

/**
 * The instruction stream of a replay read from JSON or from a saved file (#56). A `ScriptError`
 * or `Gen3Error` passes through with its message.
 */
export function streamOfLoaded(replay: Replay): ReplayStream {
  const script = buildBattleScript(replay.log)
  const { preview } = script
  return {
    replay,
    stream: buildGen3Stream(script),
    players: playersOf(script.events),
    ...(preview === undefined ? {} : { preview }),
  }
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

/** Every dropped line and fallback of `stream`, in log order. */
export function notShown(replay: Replay, stream: Gen3Stream): NotShownRow[] {
  const lines = readLines(replay.log)
  return inLineOrder(
    stream.dropped.map(droppedRow),
    stream.fallbacks.map((fallback) =>
      fallbackRow(fallback, lines[fallback.line]?.text, showsInPlace(fallback)),
    ),
  )
}
