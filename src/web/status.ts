// The page's own words: the status line after each step, the panel above the game, and the texts
// of the "Not shown in the game" list. The failures keep the words of the step that failed (replay-choice.ts, session.ts).
import { plainText } from './markup'
import type { ReplaySummary } from './replay-choice'
import type { DumpSummary, StartSummary } from './session'
import type { NotShownCount, NotShownRow } from './stream'

export const READY_LINE = 'Pick your US Emerald dump, then press Start.'
export const CHECKING_LINE = 'Checking your dump and patching it. This takes a few seconds.'
export const STARTING_LINE = 'Starting the emulator.'

export const dumpLine = ({ romSha1 }: DumpSummary): string =>
  `Your dump is US Emerald, and the page patched it (ROM SHA1 ${romSha1}). Press Start.`

export const startLine = ({ id, streamBytes }: StartSummary): string =>
  `Running ${id}: ${String(streamBytes)} bytes of instruction stream.`

/** Once the game reached END, at the win or tie line; the outro that follows belongs to no line. */
export const endedLine = (id: string): string => `Played ${id} to the end of the battle.`

const PRESS_START = 'Press Start to play it.'

/** After the user picks or loads a replay: the running game, if any, keeps its own. */
export const pickedLine = (id: string): string => `Picked ${id}. ${PRESS_START}`

export const restartLine = (id: string): string => `Restarted ${id} from the beginning.`

export const replayLine = ({
  id,
  instructions,
  streamBytes,
}: Pick<ReplaySummary, 'id' | 'instructions' | 'streamBytes'>): string =>
  `${id}: ${String(instructions)} instructions, ${String(streamBytes)} bytes of instruction stream.`

export const notShownHeading = (rows: number): string => `Not shown in the game (${String(rows)})`

export const countText = ({ what, count }: NotShownCount): string => `${what} (${String(count)})`

/**
 * One row of the list: its 1-based line, what happened, the log line and any detail, the last two
 * without Showdown's markup (#31).
 */
export function rowText({ line, what, text, detail, standIn }: NotShownRow): string {
  const shown = standIn ? `${what}, a stand-in shows` : what
  const logLine = text === '' ? '' : `: ${plainText(text)}`
  return `Line ${String(line)}, ${shown}${logLine}${detail === undefined ? '' : `; ${plainText(detail)}`}`
}

/** The panel's lines (#58): far side first, as the game shows it at the top, then the turn. */
export interface PanelText {
  readonly far: string
  readonly near: string
  readonly turn: string
}

/** A run as the panel sees it: the summary of the replay it plays, if any, and its turn word. */
export interface PanelRun {
  readonly summary: ReplaySummary | undefined
  /** The turn the game reached, 0 before turn 1. */
  readonly turn: number
}

function turnText(picked: ReplaySummary, running: PanelRun | undefined): string {
  // The same summary object, not the same id: two files named alike never share a panel.
  if (running?.summary !== picked) return PRESS_START
  return running.turn < 1 ? '' : `Turn ${String(running.turn)}`
}

/**
 * The panel for the replay the list shows. The turn is the game's while the run plays that
 * replay; for any other run, or none, the panel asks for Start.
 */
export function panelText(
  picked: ReplaySummary | undefined,
  running: PanelRun | undefined,
): PanelText {
  if (picked === undefined) return { far: '', near: '', turn: '' }
  return {
    far: `Far side: ${picked.players.far}`,
    near: `Near side: ${picked.players.near}`,
    turn: turnText(picked, running),
  }
}
