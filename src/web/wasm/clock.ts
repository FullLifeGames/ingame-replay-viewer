// The tick rule of the viewer (#35, #47): how many frames the page allows the game by a moment.
// DOM-free, so a Node spec holds it; the page asks it on each animation frame and writes the answer
// into the control words (protocol.ts, grant).
import { type Speed, ticksPerSecond } from './protocol'

/**
 * How far the grant may run ahead of the frame the game has reached, beyond the frames owed since
 * the page's previous ask, in seconds of play: 30 frames at 1x, 60 at 2x. A late animation frame
 * owes the game every frame since the previous ask, so it costs no play time. On a loaded machine
 * the page's animation frames come up to about 450 ms apart, and the next ask finds the game still
 * playing the burst the late one granted, up to 28 frames behind; a lead of 0.1 s dropped those
 * frames. A game that fell further behind its previous grant (a slow start, a phone that stalls)
 * loses that unused debt instead of racing to pay it back. A burst of one gap's frames plus the
 * lead fits the sound ring, and the worklet skips what passes its latency cap and counts it.
 */
const LEAD_SECONDS = 0.5

/**
 * How much of a gap in the page's own asks one ask pays, in seconds of play: 60 frames at 1x, 120
 * at 2x. A page in view can stop asking for seconds (a busy main thread), and the first animation
 * frame after a hidden spell can come before resume; the rest of such a gap is dropped, so the
 * burst fits the sound ring. A late animation frame on a loaded machine (about 450 ms) pays in full.
 */
const OWED_SECONDS = 1

/**
 * The tick rule: how many frames the game may have played by a moment, in milliseconds. The
 * count runs on from the start or the last change. At each ask the game gets the frames owed
 * since the previous ask, at most OWED_SECONDS of them, but never more than those plus
 * LEAD_SECONDS ahead of its frame, so a game that falls behind goes on at its pace from where it
 * is. After a hidden spell (resume) the count goes on from what it allowed before. A pause holds
 * the grant at the frame the game stood at, at every speed, until play.
 */
export class TickClock {
  private current: Speed
  private since: number
  private base: number
  private granted: number
  private held: number | undefined

  constructor(speed: Speed, now: number, frame = 0) {
    this.current = speed
    this.since = now
    this.base = frame
    this.granted = frame
  }

  get speed(): Speed {
    return this.current
  }

  get paused(): boolean {
    return this.held !== undefined
  }

  /** The frames allowed by `now` to a game at `frame`; undefined at fast, unless paused. */
  allowed(now: number, frame: number): number | undefined {
    if (this.held !== undefined) return this.held
    const rate = ticksPerSecond(this.current)
    if (rate === undefined) return undefined
    // The count stands at the grant after each ask, so what it adds is owed since the last ask.
    // An ask stamped before the start, a change or a resume counts as one at that moment.
    const due = this.base + Math.floor((Math.max(0, now - this.since) * rate) / 1000)
    const owed = Math.min(due - this.granted, Math.ceil(rate * OWED_SECONDS))
    const most = frame + owed + Math.ceil(rate * LEAD_SECONDS)
    const next = Math.max(this.granted, Math.min(due, most))
    // Moving the base drops the unused debt and keeps the fraction of a frame in hand.
    this.base -= due - next
    this.granted = next
    return next
  }

  /**
   * Holds the game at `frame`, the frame it stands at, and returns that grant. The grant falls to
   * it: the game stops where it is, not at the lead's end. A worker that handed over `frame` waits
   * for a grant at or above it, so every ask while paused returns `frame` and nothing more.
   */
  pause(frame: number): number {
    this.held = frame
    this.granted = frame
    return frame
  }

  /** Ends a pause at `now`: the count goes on from the frame of the pause. */
  play(now: number): void {
    if (this.held === undefined) return
    this.held = undefined
    this.since = now
    this.base = this.granted
  }

  /** The page is back in view at `now`: count on from the frames allowed before it was hidden. */
  resume(now: number): void {
    this.since = now
    this.base = this.granted
  }

  /** Another speed from `now` on, counted from `frame`, the frame the game is at. A pause stays. */
  change(speed: Speed, now: number, frame: number): void {
    this.current = speed
    this.since = now
    this.base = frame
    this.granted = frame
  }
}
