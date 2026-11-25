// The viewer's audio context (#47, #57): opened on the first Start, the user's gesture that lets a
// page play sound. DOM-free apart from the context's type, so a Node spec holds it with a fake
// context; run.ts hands it the factory that opens the real one.
import { messageOf } from '../message'

/**
 * Why a run plays without sound: our reason in plain words for the status line, and the browser's
 * own words, which wait under "Details" (#90). The words may be empty.
 */
export interface Silence {
  readonly reason: string
  readonly words: string
}

/** The one rule that builds a Silence: our reason, and the browser's words from its error. */
export const silenceOf = (reason: string, error: unknown): Silence => ({
  reason,
  words: messageOf(error),
})

/** The page's audio context, or why a run plays without sound. */
export type Sound = AudioContext | Silence

/**
 * The page's one audio context. When it fails to open, the run plays without sound, and the next
 * Start tries again. Once the context is open, open(), resumeNow() and suspend() call it before
 * they return, so a click's resume() runs inside the click: a phone browser may refuse one that
 * runs in a later microtask.
 */
export class AudioOpener {
  private readonly create: () => Promise<AudioContext>
  private pending: Promise<AudioContext> | undefined
  private opened: AudioContext | undefined

  constructor(create: () => Promise<AudioContext>) {
    this.create = create
  }

  /** The open context, resumed, or why a run plays without sound. */
  open(): Promise<Sound> {
    if (this.opened !== undefined) return this.started(this.opened)
    this.pending ??= this.create()
    return this.pending.then(
      (context) => {
        this.opened = context
        return this.started(context)
      },
      (error: unknown) => {
        this.pending = undefined
        return silenceOf('the page could not open its audio', error)
      },
    )
  }

  /**
   * Resumes the open context at once; nothing before the first open. Resolves with why the sound
   * stays off when the browser refuses the resume (#69), and with undefined otherwise.
   */
  resumeNow(): Promise<Silence | undefined> {
    if (this.opened === undefined) return Promise.resolve(undefined)
    return this.opened.resume().then(
      () => undefined,
      (error: unknown) => silenceOf('the audio did not resume', error),
    )
  }

  /** Suspends the open context; the ring keeps its samples for the next resume. */
  suspend(): Promise<void> {
    return this.opened?.suspend() ?? Promise.resolve()
  }

  private started(context: AudioContext): Promise<Sound> {
    return context.resume().then(
      () => context,
      (error: unknown) => silenceOf('the audio did not start', error),
    )
  }
}
