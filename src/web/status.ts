// The page's own words: the status line after each step, the viewer's progress line under
// "Details", the panel above the game with the side headings it shares with the team list, and
// the texts of the "Not shown in the game" list. A failure's line comes from visitor.ts, and the
// words of the step that failed (replay-choice.ts, session.ts) become its detail. A line names a
// replay by its replay label (label.ts), as the example select does (#90).
import type { Side } from '../script/types'
import { plainText } from './markup'
import type { ReplaySummary } from './replay-choice'
import type { DumpSummary } from './session'
import type { NotShownCount, NotShownRow } from './stream'
import { soundLine } from './wasm/audio'
import type { Silence } from './wasm/audio-opener'
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

/**
 * Once the emulator page started a replay. mGBA gives the page no memory read, so it cannot tell
 * END: the line holds over the game and over the black screen after its outro (#90). It carries
 * no detail: the pick's counts under "Details" already give the stream's bytes (replayDetail).
 */
export const startLine = (label: string): string => `Started ${label}.`

/** The viewer's lines while it builds the game from the dump, and once it did. */
export const BUILDING_LINE = 'Checking your dump and building the game. This takes a few seconds.'
export const BUILT_LINE =
  'Your dump is US Emerald, and the page built the game from it. Press Start.'

/**
 * Why a run plays or played without sound, in our words, as the end of its line; empty for a run
 * with sound. The running line and the END line share it (#59).
 */
export const silenceText = (silence: Silence | undefined, verb: 'plays' | 'played'): string =>
  silence === undefined ? '' : ` It ${verb} without sound: ${silence.reason}.`

/** A viewer's line with the browser's own words for a run without sound under "Details" (#90). */
const soundStatus = (
  line: string,
  silence: Silence | undefined,
  verb: 'plays' | 'played',
): StatusLine => ({ line: `${line}${silenceText(silence, verb)}`, detail: silence?.words ?? '' })

/**
 * Once the game reached END, at the win or tie line; the outro that follows belongs to no line.
 * It replaces the running line, so it keeps the reason a run had no sound.
 */
export const endedLine = (label: string, silence?: Silence): StatusLine =>
  soundStatus(`Played ${label} to the end of the battle.`, silence, 'played')

/** What the viewer's lines read of a run (run.ts's Run): its time to END and its sound. */
interface LineRun {
  /** The length of the instruction stream it plays. */
  readonly streamBytes: number
  readonly finishedMs: number | undefined
  /** The audio worklet's node; undefined for a run without sound. */
  readonly output: unknown
  readonly ring: { readonly skipped: number; readonly underruns: number }
  readonly silence: Silence | undefined
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
): StatusLine => soundStatus(`Running ${picked.label}.`, run.silence, 'plays')

const PRESS_START = 'Press Start to play it.'

/** After the user picks or loads a replay: the running game, if any, keeps its own. */
export const pickedLine = (label: string): string => `Picked ${label}. ${PRESS_START}`

export const restartLine = (label: string): string => `Restarted ${label} from the beginning.`

/** The summary above "Not shown": the picked replay by its label, as the select names it (#90). */
export const replaySummaryLine = ({ label }: Pick<ReplaySummary, 'label'>): string => label

/** The picked replay's counts, a developer's numbers, under the page's "Details" (#90). */
export const replayDetail = ({
  instructions,
  streamBytes,
}: Pick<ReplaySummary, 'instructions' | 'streamBytes'>): string =>
  `${String(instructions)} instructions, ${streamText(streamBytes)}.`

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
