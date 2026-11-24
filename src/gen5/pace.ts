// How fast the DS core runs (#72): frames per second from samples of (wall time, frame count),
// the share of the DS's own rate, and a fixed JavaScript loop that gives a device's speed, so a
// figure from the build machine can be set beside one from the user's PC or phone on the same page.

/** The DS draws 59.8261 frames a second (GBATEK, "DS Video": 33.513982 MHz / (6 × 355 × 263)). */
export const DS_FRAME_RATE = 59.8261

/** Loop turns between two reads of the clock in `loopCount`. */
export const LOOP_CHUNK = 1024

export interface PaceSample {
  /** Wall time in milliseconds. */
  ms: number
  /** The core's frame counter at that time. */
  frame: number
}

export interface Pace {
  startMs: number
  seconds: number
  frames: number
  fps: number
  /** fps over the DS's rate: 1 is real time. */
  ratio: number
}

export function paceBetween(from: PaceSample, to: PaceSample): Pace {
  const seconds = (to.ms - from.ms) / 1000
  if (seconds <= 0) throw new RangeError('This span has no time in it, so it has no frame rate.')
  const frames = to.frame - from.frame
  const fps = frames / seconds
  return { startMs: from.ms, seconds, frames, fps, ratio: fps / DS_FRAME_RATE }
}

/** Back-to-back windows from the first sample on; each ends at the first sample at least
 * `windowMs` after its start. A tail shorter than a window gives none. */
export function paceWindows(samples: readonly PaceSample[], windowMs: number): Pace[] {
  const windows: Pace[] = []
  let from = samples[0]
  for (const sample of samples) {
    if (from && sample.ms - from.ms >= windowMs) {
      windows.push(paceBetween(from, sample))
      from = sample
    }
  }
  return windows
}

/** The pace from the last sample back to the earliest sample at most `spanMs` before it, from
 * samples in time order; none for fewer than two. */
export function paceOver(samples: readonly PaceSample[], spanMs: number): Pace | undefined {
  const last = samples.at(-1)
  const first = samples.find((sample) => last !== undefined && last.ms - sample.ms <= spanMs)
  if (!first || !last || first === last) return undefined
  return paceBetween(first, last)
}

export function paceLine(pace: Pace): string {
  return `${pace.fps.toFixed(1)} fps, ${pace.ratio.toFixed(3)} of the DS rate (${String(pace.frames)} frames in ${pace.seconds.toFixed(1)} s)`
}

/** Turns of a fixed integer loop on one thread until `ms` pass on the clock `now`. */
export function loopCount(ms: number, now: () => number): number {
  const start = now()
  let turns = 0
  let mix = 1
  while (now() - start < ms) {
    for (let i = 0; i < LOOP_CHUNK; i += 1) mix = (Math.imul(mix, 31) + i) | 0
    turns += LOOP_CHUNK
  }
  // `mix` is an integer, so this never adds; it keeps the engine from dropping the loop.
  return mix === 0.5 ? turns + 1 : turns
}
