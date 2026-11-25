// The emulator page's Start and Restart (#8, #51, #69). DOM-free, so a Node spec covers them;
// main.ts hands them the session, the page's buttons and status line, and the audio hand-over.
import type { AudioHandOver } from './emulator'
import type { Session } from './session'
import * as say from './status'

/** What a press reads and writes of the page: its two buttons, its status line and failures. */
export interface PressView {
  readonly start: { disabled: boolean }
  readonly restart: { disabled: boolean }
  readonly status: (line: string | say.StatusLine) => void
  readonly failure: (error: unknown) => void
}

/** Runs a handler's work; a failure becomes its visitor line, with the module's words as detail. */
export function act(view: Pick<PressView, 'failure'>, work: () => unknown): void {
  Promise.resolve()
    .then(work)
    .catch((error: unknown) => {
      view.failure(error)
    })
}

/** The handlers of the clicks on Start and Restart. */
export function emulatorPresses(
  session: Pick<Session, 'start' | 'restart'>,
  view: PressView,
  audio: Pick<AudioHandOver, 'open'>,
) {
  let running = ''
  return {
    start: (): void => {
      // Before any await: Firefox opens audio only while the tap's activation lasts (#51).
      audio.open()
      view.status(say.STARTING_LINE)
      view.start.disabled = true
      act(view, async () => {
        const started = await session.start().finally(() => {
          view.start.disabled = false
        })
        running = started.label
        view.status(say.startLine(started))
        view.restart.disabled = false
      })
    },
    // In the click itself, with no act: the adapter's Restart resumes the sound, and Firefox may
    // refuse a resume that runs after the handler first yields (#69).
    restart: (): void => {
      try {
        session.restart()
        view.status(say.restartLine(running))
      } catch (error: unknown) {
        view.failure(error)
      }
    },
  }
}
