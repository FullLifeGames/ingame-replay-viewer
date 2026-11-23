// The viewer's Pause and Play (#57): the button's state, the Space rule and the toggle. DOM-free,
// so a Node spec holds it; main.ts wires the button, the key and the draw loop to it. The pause
// itself lives in the clock (clock.ts), so the page asks the clock whether a run stands paused.
import type { AudioOpener } from './audio-opener'
import type { TickClock } from './clock'
import { grant, readStatus } from './protocol'

const PAUSE_LABEL = 'Pause'
const PLAY_LABEL = 'Play'

/** What the button shows: Pause while a run plays, Play while it stands paused. */
export interface PauseButton {
  readonly label: typeof PAUSE_LABEL | typeof PLAY_LABEL
  readonly disabled: boolean
}

/** A run as the pause sees it: its clock and its control words. */
export interface PausedRun {
  readonly clock: TickClock
  readonly control: Int32Array
}

/** Whether the run's game reached END: a finished battle has nothing left to pause. */
const reachedEnd = (run: PausedRun): boolean => readStatus(run.control).finished

/** The button for the current run; disabled before the first run and once it reached END. */
export function pauseButton(run: PausedRun | undefined): PauseButton {
  if (run === undefined || reachedEnd(run)) return { label: PAUSE_LABEL, disabled: true }
  return { label: run.clock.paused ? PLAY_LABEL : PAUSE_LABEL, disabled: false }
}

/** A key press as the Space rule reads it: a KeyboardEvent, or a plain object with its fields. */
export interface KeyPress {
  readonly key: string
  readonly repeat: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly metaKey: boolean
  /** The element the key went to: read for `tagName` and `isContentEditable`. */
  readonly target: object | null
}

/** The elements that do something of their own on Space: click, check, open or follow. */
const OWN_SPACE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'TEXTAREA'])

function ownsSpace(target: object | null): boolean {
  if (target === null) return false
  const { tagName, isContentEditable } = target as {
    tagName?: unknown
    isContentEditable?: unknown
  }
  return isContentEditable === true || OWN_SPACE.has(String(tagName).toUpperCase())
}

/**
 * Whether a key press toggles the pause of `run`: Space with no repeat and no modifier, on a target
 * that has no use of its own for it. Before the first run and once it reached END, Space keeps the
 * browser's own use.
 */
export function spaceToggles(press: KeyPress, run: PausedRun | undefined): boolean {
  const plain = !press.repeat && !press.ctrlKey && !press.altKey && !press.metaKey
  if (run === undefined || reachedEnd(run)) return false
  return press.key === ' ' && plain && !ownsSpace(press.target)
}

/**
 * Pauses a playing run at the frame its game reports and suspends the sound, or plays a paused run
 * on: the sound resumes first, inside the caller's click, then the clock counts on. Writes the
 * grant at once, so the worker stops or goes on before the next animation frame. Returns the
 * sound's promise; nothing happens before the first run or once the run reached END.
 */
export function togglePause(
  run: PausedRun | undefined,
  audio: Pick<AudioOpener, 'resumeNow' | 'suspend'>,
  now: number,
): Promise<void> {
  if (run === undefined || reachedEnd(run)) return Promise.resolve()
  const { frame } = readStatus(run.control)
  if (!run.clock.paused) {
    grant(run.control, run.clock.pause(frame))
    return audio.suspend()
  }
  const resumed = audio.resumeNow()
  run.clock.play(now)
  grant(run.control, run.clock.allowed(now, frame))
  return resumed
}

/**
 * Asks the sound back for a run that Start or Restart put in place, unless it stands paused: a
 * Pause pressed for the old run while the new one waited suspended the shared sound. Returns the
 * sound's promise.
 */
export function soundForNewRun(
  run: Pick<PausedRun, 'clock'>,
  audio: Pick<AudioOpener, 'resumeNow'>,
): Promise<void> {
  return run.clock.paused ? Promise.resolve() : audio.resumeNow()
}
