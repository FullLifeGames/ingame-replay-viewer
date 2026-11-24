// The spike page's speed lines (#72): this device's figures, measured once at load, and the
// core's frame rate over the last 5 s and the last 60 s. src/gen5/pace.ts holds the rules.
import type { Calibration } from '../../gen5/hook.ts'
import { loopCount, paceLine, paceOver, type PaceSample } from '../../gen5/pace.ts'

const CALIBRATION_MS = 2000
const SHORT_SPAN_MS = 5000
const LONG_SPAN_MS = 60_000

/** The core's frame rate over the two spans, undefined until a span has two samples. */
export interface Rates {
  fps5: number | undefined
  fps60: number | undefined
}

export function calibrate(): Calibration {
  const loopTurns = loopCount(CALIBRATION_MS, () => performance.now())
  return { cores: navigator.hardwareConcurrency, loopTurns, loopMs: CALIBRATION_MS }
}

export function calibrationLine(figures: Calibration): string {
  const millions = (figures.loopTurns / 1e6).toFixed(1)
  const seconds = String(figures.loopMs / 1000)
  return `This device: ${String(figures.cores)} logical cores, ${millions} million loop turns in ${seconds} s on one thread.`
}

/** Samples the frame counter once a second and hands on the rates and the speed line. */
export function watchSpeed(frames: () => number, show: (rates: Rates, line: string) => void): void {
  const samples: PaceSample[] = []
  setInterval(() => {
    const now = { ms: performance.now(), frame: frames() }
    samples.push(now)
    while (samples.length > 1 && now.ms - (samples[0]?.ms ?? now.ms) > LONG_SPAN_MS) {
      samples.shift()
    }
    const short = paceOver(samples, SHORT_SPAN_MS)
    const long = paceOver(samples, LONG_SPAN_MS)
    if (!short || !long) return
    show(
      { fps5: short.fps, fps60: long.fps },
      `Speed over the last 5 s: ${paceLine(short)}. Over the last ${long.seconds.toFixed(0)} s: ${long.fps.toFixed(1)} fps.`,
    )
  }, 1000)
}
