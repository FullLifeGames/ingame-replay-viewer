// What the WebAssembly spike page (#35) and its worker share: the SharedArrayBuffer layout and
// the tick rule. The worker runs AgbMain, which never returns, so after the start message
// everything goes through shared memory: the worker writes each frame, the frame count and
// the replay progress there, and before it plays on it waits until the page allows the frame. The
// page allows frames by the tick rule (1x, 2x) or lifts the limit (fast). DOM-free; messages.ts
// holds the two messages.
import { FRAME_BYTES } from './frame.ts'
import type { Progress } from './progress.ts'

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

/** The tick rule: how many frames the game may have played by a moment, in milliseconds. */
export class TickClock {
  private current: Speed
  private since: number
  private base: number

  constructor(speed: Speed, now: number, frame = 0) {
    this.current = speed
    this.since = now
    this.base = frame
  }

  get speed(): Speed {
    return this.current
  }

  /** The frames allowed by `now`; undefined at fast. */
  allowed(now: number): number | undefined {
    const rate = ticksPerSecond(this.current)
    if (rate === undefined) return undefined
    return this.base + Math.floor(((now - this.since) * rate) / 1000)
  }

  /** Another speed from `now` on, counted from `frame`, the frame the game is at. */
  change(speed: Speed, now: number, frame: number): void {
    this.current = speed
    this.since = now
    this.base = frame
  }
}

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
} as const

export interface SharedBuffers {
  /** Int32 words at the indexes of CONTROL. */
  readonly control: SharedArrayBuffer
  /** The newest frame as RGBA. */
  readonly frame: SharedArrayBuffer
  /** The audio ring (AudioRing); unused until the game has sound. */
  readonly audio: SharedArrayBuffer
}

// The audio ring's header: the samples written and read so far, and the overruns.
const RING = { written: 0, read: 1, overruns: 2 } as const
const RING_HEADER_BYTES = 4 * Object.keys(RING).length

/** Fresh buffers for one run, with an audio ring of `audioCapacity` samples. */
export function createShared(audioCapacity: number): SharedBuffers {
  if (!Number.isSafeInteger(audioCapacity) || audioCapacity < 1) {
    throw new Error(
      `the audio ring needs a capacity of 1 or more samples, not ${String(audioCapacity)}`,
    )
  }
  return {
    control: new SharedArrayBuffer(4 * Object.keys(CONTROL).length),
    frame: new SharedArrayBuffer(FRAME_BYTES),
    audio: new SharedArrayBuffer(RING_HEADER_BYTES + 4 * audioCapacity),
  }
}

/** The page's side: allows the game `allowed` frames, or every frame when undefined. */
export function grant(control: Int32Array, allowed: number | undefined): void {
  Atomics.store(control, CONTROL.fast, allowed === undefined ? 1 : 0)
  if (allowed !== undefined) Atomics.store(control, CONTROL.allowed, allowed)
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

/** A ring of float samples from one writer (the worker) to one reader (the audio thread). */
export class AudioRing {
  readonly capacity: number
  private readonly header: Int32Array
  private readonly samples: Float32Array

  constructor(buffer: SharedArrayBuffer) {
    this.header = new Int32Array(buffer, 0, Object.keys(RING).length)
    this.samples = new Float32Array(buffer, RING_HEADER_BYTES)
    this.capacity = this.samples.length
  }

  get overruns(): number {
    return Atomics.load(this.header, RING.overruns)
  }

  /** Writes what fits; returns the samples it dropped, and counts an overrun when it dropped some. */
  push(input: Float32Array): number {
    const written = Atomics.load(this.header, RING.written)
    const free = this.capacity - (written - Atomics.load(this.header, RING.read))
    const count = Math.min(free, input.length)
    for (let i = 0; i < count; i++) this.samples[(written + i) % this.capacity] = input[i] ?? 0
    Atomics.store(this.header, RING.written, written + count)
    const dropped = input.length - count
    if (dropped > 0) Atomics.add(this.header, RING.overruns, 1)
    return dropped
  }

  /** Reads up to `out.length` samples into `out`; returns how many. */
  pull(out: Float32Array): number {
    const read = Atomics.load(this.header, RING.read)
    const count = Math.min(out.length, Atomics.load(this.header, RING.written) - read)
    for (let i = 0; i < count; i++) out[i] = this.samples[(read + i) % this.capacity] ?? 0
    Atomics.store(this.header, RING.read, read + count)
    return count
  }
}
