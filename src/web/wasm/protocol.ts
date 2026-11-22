// What the WebAssembly spike page (#35) and its worker share: the SharedArrayBuffer layout and
// the tick rule. The worker runs AgbMain, which never returns, so after the start message
// everything goes through shared memory: the worker writes each frame, the frame count and
// the replay progress there, and before it plays on it waits until the page allows the frame. The
// page allows frames by the tick rule (1x, 2x) or lifts the limit (fast). DOM-free; messages.ts
// holds the two messages, frame-swap.ts the hand-over of the frames through two buffers.
import { FRAME_BYTES } from './frame.ts'
import type { Progress } from './progress.ts'
import { ringBytes } from './ring.ts'

export type Speed = '1x' | '2x' | 'fast'
export const SPEEDS: readonly Speed[] = ['1x', '2x', 'fast']

/** The GBA's frame rate: 228 lines of 1232 cycles each at 2^24 Hz. */
export const GBA_FRAMES_PER_SECOND = 2 ** 24 / (228 * 1232)

const FACTORS: Record<Speed, number | undefined> = { '1x': 1, '2x': 2, fast: undefined }

/** The frames per second a speed allows; undefined for fast, which allows every frame at once. */
export function ticksPerSecond(speed: Speed): number | undefined {
  const factor = FACTORS[speed]
  return factor === undefined ? undefined : GBA_FRAMES_PER_SECOND * factor
}

/** The speed after END: the game plays on, and fast gives way to 1x, so no core spins. */
export const speedAtEnd = (speed: Speed): Speed => (speed === 'fast' ? '1x' : speed)

/**
 * The tick rule: how many frames the game may have played by a moment, in milliseconds. The
 * count runs on from the start or the last change, so a game that falls behind catches up.
 * After a pause (resume) the count goes on from what it allowed before the pause.
 */
export class TickClock {
  private current: Speed
  private since: number
  private base: number
  private granted: number

  constructor(speed: Speed, now: number, frame = 0) {
    this.current = speed
    this.since = now
    this.base = frame
    this.granted = frame
  }

  get speed(): Speed {
    return this.current
  }

  /** The frames allowed by `now`; undefined at fast. */
  allowed(now: number): number | undefined {
    const rate = ticksPerSecond(this.current)
    if (rate === undefined) return undefined
    this.granted = this.base + Math.floor(((now - this.since) * rate) / 1000)
    return this.granted
  }

  /** The page is back in view at `now`: count on from the frames allowed before it was hidden. */
  resume(now: number): void {
    this.since = now
    this.base = this.granted
  }

  /** Another speed from `now` on, counted from `frame`, the frame the game is at. */
  change(speed: Speed, now: number, frame: number): void {
    this.current = speed
    this.since = now
    this.base = frame
    this.granted = frame
  }
}

/**
 * The rate of the game's mixer (IRV_WASM_MIXER_RATE in rom/gen3/wasm/include/irv_wasm_sound.h):
 * 704 samples per frame, left and right each. The module passes its rate with every frame's
 * samples, and the worker refuses another.
 */
export const MIXER_RATE = 42_048

const PACES: Record<Speed, number> = { '1x': 1, '2x': 2, fast: 0 }

/** The control words: what the page allows, and what the worker reports after each frame. */
export const CONTROL = {
  allowed: 0,
  fast: 1,
  frame: 2,
  finishedAt: 3,
  done: 4,
  total: 5,
  turn: 6,
  error: 7,
  finished: 8,
  playing: 9,
  pace: 10,
  /** The frame buffer that holds the newest whole frame (frame-swap.ts). */
  front: 11,
  /** The frame buffer the page copies, or NOT_READING. */
  reading: 12,
} as const

/** The reading word while the page copies no frame buffer. */
export const NOT_READING = -1

/**
 * The page's side: how the worker hands on the game's sound at `speed`. 1x plays it, 2x plays it
 * at double pace, and fast, where the worker runs uncapped, keeps it silent.
 */
export function writePace(control: Int32Array, speed: Speed): void {
  Atomics.store(control, CONTROL.pace, PACES[speed])
}

/** The worker's side: 1 or 2 frames of the game's sound per frame played, or 0 for none. */
export function readPace(control: Int32Array): number {
  return Atomics.load(control, CONTROL.pace)
}

export interface SharedBuffers {
  /** Int32 words at the indexes of CONTROL. */
  readonly control: SharedArrayBuffer
  /** Two RGBA frames, one after the other: the newest whole frame and the one the worker draws. */
  readonly frames: SharedArrayBuffer
  /** The audio ring (ring.ts): the game's sound, left and right interleaved. */
  readonly audio: SharedArrayBuffer
}

/** Fresh buffers for one run, with an audio ring of `audioCapacity` samples. */
export function createShared(audioCapacity: number): SharedBuffers {
  const control = new SharedArrayBuffer(4 * Object.keys(CONTROL).length)
  Atomics.store(new Int32Array(control), CONTROL.reading, NOT_READING)
  return {
    control,
    frames: new SharedArrayBuffer(2 * FRAME_BYTES),
    audio: new SharedArrayBuffer(ringBytes(audioCapacity)),
  }
}

// At fast the allowed word takes the largest Int32, so a worker that read it before the switch
// finds it changed when it waits.
const EVERY_FRAME = 2 ** 31 - 1

/** The page's side: allows the game `allowed` frames, or every frame when undefined. */
export function grant(control: Int32Array, allowed: number | undefined): void {
  Atomics.store(control, CONTROL.fast, allowed === undefined ? 1 : 0)
  Atomics.store(control, CONTROL.allowed, allowed ?? EVERY_FRAME)
  Atomics.notify(control, CONTROL.allowed)
}

/**
 * The worker's side, after it handed over frame `frame`: returns once the page allows that frame,
 * or false after `timeoutMs` without the grant. Blocks the worker's thread while it waits.
 */
export function waitForTick(control: Int32Array, frame: number, timeoutMs = Infinity): boolean {
  const end = performance.now() + timeoutMs
  for (;;) {
    if (Atomics.load(control, CONTROL.fast) === 1) return true
    const allowed = Atomics.load(control, CONTROL.allowed)
    if (allowed >= frame) return true
    const left = end - performance.now()
    if (left <= 0) return false
    Atomics.wait(control, CONTROL.allowed, allowed, left)
  }
}

/** What the worker reports after each frame. */
export interface RunStatus extends Progress {
  /** The frames played so far. */
  frame: number
  /** The first frame on which the interpreter reported finished; 0 before it. */
  finishedAt: number
}

/** The worker's side: the frame count and the progress after frame `frame`. */
export function writeStatus(control: Int32Array, frame: number, progress: Progress): void {
  const words: [keyof typeof CONTROL, number][] = [
    ['done', progress.done],
    ['total', progress.total],
    ['turn', progress.turn],
    ['error', progress.error],
    ['finished', progress.finished ? 1 : 0],
    ['playing', progress.playing ? 1 : 0],
  ]
  for (const [name, value] of words) Atomics.store(control, CONTROL[name], value)
  if (progress.finished && Atomics.load(control, CONTROL.finishedAt) === 0) {
    Atomics.store(control, CONTROL.finishedAt, frame)
  }
  Atomics.store(control, CONTROL.frame, frame)
}

/** The page's side: the worker's last report. */
export function readStatus(control: Int32Array): RunStatus {
  const word = (name: keyof typeof CONTROL) => Atomics.load(control, CONTROL[name])
  return {
    frame: word('frame'),
    finishedAt: word('finishedAt'),
    done: word('done'),
    total: word('total'),
    turn: word('turn'),
    error: word('error'),
    finished: word('finished') !== 0,
    playing: word('playing') !== 0,
  }
}
