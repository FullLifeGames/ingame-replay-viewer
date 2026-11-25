// The viewer's Pause and Play (#57): the button's state, the Space rule and the toggle. DOM-free,
// so a Node spec holds it; main.ts wires the button, the key and the draw loop to it. The pause
// itself lives in the clock (clock.ts), so the page asks the clock whether a run stands paused.
import { runningLine, type StatusLine } from '../status'
import type { AudioOpener, Silence, Sound } from './audio-opener'
import type { TickClock } from './clock'
import { grant, readStatus } from './protocol'
import type { Runs } from './runs'

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
 * A run as the toggle sees it: the pause's run, its replay label, why it has no sound, and the
 * summary of the pick it plays, which the hook's own stream lacks.
 */
export interface ToggledRun extends PausedRun {
  readonly label: string
  readonly silence: Silence | undefined
  readonly summary?: object | undefined
}

/** The runs whose last Play the browser refused to resume, so their line says so. */
const refused = new WeakSet<ToggledRun>()

/**
 * The status line after a Play: the refusal's line, or the running line once a Play resumes the
 * sound after a refusal. The run's own reason for no sound stays in it. Undefined otherwise.
 */
function playLine(run: ToggledRun, silence: Silence | undefined): StatusLine | undefined {
  if (silence !== undefined) {
    refused.add(run)
    return runningLine(run, { silence })
  }
  return refused.delete(run) ? runningLine(run, run) : undefined
}

/**
 * Whether the page shows another pick than the one `run` plays: a pick during the pause wrote
 * "Picked …", which stays until the next Start makes a run with its own line (#90, D4).
 */
const showsOtherPick = (run: ToggledRun, shown: object | undefined): boolean =>
  run.summary !== undefined && run.summary !== shown

/**
 * Pauses a playing run at the frame its game reports and suspends the sound, or plays a paused run
 * on: the sound resumes first, inside the caller's click, then the clock counts on. Writes the
 * grant at once, so the worker stops or goes on before the next animation frame. Nothing happens
 * before the first run or once the run reached END. Resolves with the status line for a Play whose
 * resume the browser refused (#69): the game plays on without sound, and the line says why. The
 * next Play whose resume succeeds resolves with the running line again. A refused suspend gives no
 * line, since the clock holds the game anyway (S5-16). Neither line comes while the page shows
 * `shown`, the summary of another pick than the run's.
 */
export function togglePause(
  run: ToggledRun | undefined,
  audio: Pick<AudioOpener, 'resumeNow' | 'suspend'>,
  now: number,
  shown?: object,
): Promise<StatusLine | undefined> {
  if (run === undefined || reachedEnd(run)) return Promise.resolve(undefined)
  const { frame } = readStatus(run.control)
  if (!run.clock.paused) {
    grant(run.control, run.clock.pause(frame))
    return audio.suspend().then(
      () => undefined,
      () => undefined,
    )
  }
  const resumed = audio.resumeNow()
  run.clock.play(now)
  grant(run.control, run.clock.allowed(now, frame))
  return resumed.then((silence) => {
    const line = playLine(run, silence)
    return showsOtherPick(run, shown) ? undefined : line
  })
}

/**
 * Asks the sound back for a run that Start or Restart put in place, unless it stands paused: a
 * Pause pressed for the old run while the new one waited suspended the shared sound. Resolves as
 * resumeNow does.
 */
export function soundForNewRun(
  run: Pick<PausedRun, 'clock'>,
  audio: Pick<AudioOpener, 'resumeNow'>,
): Promise<Silence | undefined> {
  return run.clock.paused ? Promise.resolve(undefined) : audio.resumeNow()
}

/** A run's sound on the speakers, which a Start during its pause takes off first (R39). */
export interface Speakers {
  /** Whether a press took the run's sound off the speakers and nobody gave it back yet. */
  readonly muted: boolean
  /** Takes the run's sound off the speakers; its ring keeps what it holds. */
  readonly mute: () => void
  readonly unmute: () => void
}

/** A run as the sound of a Start sees it: its clock and its sound on the speakers. */
export interface HeldRun extends Pick<PausedRun, 'clock'> {
  readonly speakers: Speakers
}

/** The sound of a press on Start or Restart, and what the press does with it once it ends. */
interface PressSound {
  readonly sound: Promise<Sound>
  readonly settle: () => Promise<void>
}

/** The run a press holds: the current one while it stands paused or an earlier press muted it. */
function heldBy<R extends HeldRun>(current: R | undefined): R | undefined {
  if (current === undefined) return undefined
  return current.clock.paused || current.speakers.muted ? current : undefined
}

/**
 * Opens the sound for the press `ticket` on Start or Restart, inside the press. A run that stands
 * paused holds sound in its ring, and the context's resume would play it until the new run
 * replaces that run: its sound leaves the speakers first (R39, #69). `settle` runs once the play
 * ends. When that run is still the page's and no newer press came, it gets its sound back; while
 * it stands paused, the context suspends first, so it does not run under the paused run. A newer
 * press holds a run that an earlier one muted, even after Play took it on, so the newest press
 * gives the sound back whichever press ends last (W11).
 */
export function soundForPress<R extends HeldRun>(
  runs: Pick<Runs<R>, 'current' | 'isNewest'>,
  ticket: number,
  audio: Pick<AudioOpener, 'open' | 'suspend'>,
): PressSound {
  const held = heldBy(runs.current)
  if (held?.speakers.muted === false) held.speakers.mute()
  const settle = (): Promise<void> => {
    if (held === undefined || runs.current !== held || !runs.isNewest(ticket)) {
      return Promise.resolve()
    }
    const back = () => {
      held.speakers.unmute()
    }
    if (held.clock.paused) return audio.suspend().then(back, back)
    back()
    return Promise.resolve()
  }
  return { sound: audio.open(), settle }
}
