// The page's own words: the status line after each step, the viewer's progress line under
// "Details", the panel above the game with the side headings it shares with the team list, and
// the texts of the "Not shown in the game" list. A failure's line comes from visitor.ts, and the
// words of the step that failed (replay-choice.ts, session.ts) become its detail. A line names a
// replay by its replay label (label.ts), as the example select does (#90).
import type { Side } from '../script/types'
import { plainText } from './markup'
import type { ReplaySummary } from './replay-choice'
import type { DumpSummary, StartSummary } from './session'
import type { NotShownCount, NotShownRow } from './stream'
import { soundLine } from './wasm/audio'
import type { RunStatus } from './wasm/protocol'

export const READY_LINE = 'Pick your US Emerald dump, then press Start.'
export const CHECKING_LINE = 'Checking your dump and patching it. This takes a few seconds.'
export const STARTING_LINE = 'Starting the emulator.'

/**
 * A line of the page's own and the words "Details" holds under it. The status line says what
 * plays and what to press; a developer's numbers, such as a SHA1 or a byte count, wait under
 * "Details" (#69).
 */
export interface StatusLine {
  readonly line: string
  readonly detail: string
}

export const dumpLine = ({ romSha1 }: DumpSummary): StatusLine => ({
  line: 'Your dump is US Emerald, and the page patched it. Press Start.',
  detail: `The patched ROM's SHA1 is ${romSha1}.`,
})

const streamText = (bytes: number): string => `${String(bytes)} bytes of instruction stream`

export const startLine = ({
  label,
  streamBytes,
}: Pick<StartSummary, 'label' | 'streamBytes'>): StatusLine => ({
  line: `Running ${label}.`,
  detail: `${streamText(streamBytes)}.`,
})

/** The viewer's lines while it builds the game from the dump, and once it did. */
export const BUILDING_LINE = 'Checking your dump and building the game. This takes a few seconds.'
export const BUILT_LINE =
  'Your dump is US Emerald, and the page built the game from it. Press Start.'

/**
 * Why a run plays or played without sound, as the end of its line; empty for a run with sound.
 * The running line and the END line share it (#59).
 */
export const silenceText = (silence: string | undefined, verb: 'plays' | 'played'): string =>
  silence === undefined ? '' : ` It ${verb} without sound: ${silence}.`

/**
 * Once the game reached END, at the win or tie line; the outro that follows belongs to no line.
 * It replaces the running line, so it keeps the reason a run had no sound.
 */
export const endedLine = (label: string, silence?: string): string =>
  `Played ${label} to the end of the battle.${silenceText(silence, 'played')}`

/** What the viewer's lines read of a run (run.ts's Run): its time to END and its sound. */
interface LineRun {
  /** The length of the instruction stream it plays. */
  readonly streamBytes: number
  readonly finishedMs: number | undefined
  /** The audio worklet's node; undefined for a run without sound. */
  readonly output: unknown
  readonly ring: { readonly skipped: number; readonly underruns: number }
  readonly silence: string | undefined
}

/**
 * The run's progress under "Details", with the stream's bytes (#69) and the sound's skips and dry
 * spells while it has sound (#47).
 */
export const progressLine = (status: RunStatus, run: LineRun): string => {
  const finished =
    run.finishedMs === undefined
      ? ''
      : ` Finished at frame ${String(status.finishedAt)} after ${(run.finishedMs / 1000).toFixed(1)} s.`
  const sound = run.output === undefined ? '' : ` ${soundLine(run.ring)}`
  const instruction = `instruction ${String(status.done)} of ${String(status.total)} (${streamText(run.streamBytes)})`
  return `Frame ${String(status.frame)}, ${instruction}, turn ${String(status.turn)}.${finished}${sound}`
}

/** Once a run starts: the replay it plays, by its label, and why it plays without sound. */
export const runningLine = (
  picked: { readonly label: string },
  run: Pick<LineRun, 'silence'>,
): string => `Running ${picked.label}.${silenceText(run.silence, 'plays')}`

const PRESS_START = 'Press Start to play it.'

/** After the user picks or loads a replay: the running game, if any, keeps its own. */
export const pickedLine = (label: string): string => `Picked ${label}. ${PRESS_START}`

export const restartLine = (label: string): string => `Restarted ${label} from the beginning.`

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

const SIDE_WORDS: Readonly<Record<Side, string>> = { far: 'Far side', near: 'Near side' }

/** A side's heading: the panel's line (#58) and the team list's heading (#87) read the same. */
export const sideLine = (side: Side, name: string): string => `${SIDE_WORDS[side]}: ${name}`

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
    far: sideLine('far', picked.players.far),
    near: sideLine('near', picked.players.near),
    turn: turnText(picked, running),
  }
}
