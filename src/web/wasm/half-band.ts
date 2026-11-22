// The low-pass before the 2x decimation of the game's sound (#47). At 2x the worker keeps one left
// and right pair of each two, which halves the mixer's rate and its Nyquist frequency to
// 10.5 kHz; without a filter, the sound above it folds back as noise. A half-band FIR takes it
// down first. Its history runs across frames, so a frame boundary leaves no step. DOM-free.

// 19 taps of a windowed sinc cut at a quarter of the rate. Every other tap but the middle one is
// zero, so each output pair costs ten products per channel. With a Hamming window it keeps
// 0 to 6 kHz within 0.1 dB and takes 14 kHz and up down by 38 dB or more.
const TAPS = 19

/** The nonzero taps as offsets back from the newest pair, with their weights summed to 1. */
function halfBandTaps(): { offset: number; weight: number }[] {
  const middle = (TAPS - 1) / 2
  const taps = []
  for (let offset = 0; offset < TAPS; offset++) {
    const n = offset - middle
    const sinc = n === 0 ? 0.5 : Math.sin((Math.PI * n) / 2) / (Math.PI * n)
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * offset) / (TAPS - 1))
    if (Math.abs(sinc) > 1e-12) taps.push({ offset, weight: sinc * window })
  }
  const sum = taps.reduce((total, tap) => total + tap.weight, 0)
  return taps.map(({ offset, weight }) => ({ offset, weight: weight / sum }))
}

const WEIGHTS = halfBandTaps()

/**
 * The 2x decimation with its filter: interleaved left and right pairs in, one filtered pair of
 * each two out. Each call goes on from the last, so frames come out as one call over all of them.
 */
export class HalfBand {
  // The last TAPS input pairs, left and right, in a ring that `newest` points into.
  private readonly history = new Float32Array(2 * TAPS)
  private newest = 0
  // Whether the next input pair is the second of two, which the filter does not hand out.
  private second = false

  /** Forgets the history, as before the first frame. */
  reset(): void {
    this.history.fill(0)
    this.newest = 0
    this.second = false
  }

  decimate(samples: Float32Array): Float32Array {
    const pairs = Math.floor(samples.length / 2)
    const out = new Float32Array(2 * (this.second ? Math.floor(pairs / 2) : Math.ceil(pairs / 2)))
    let written = 0
    for (let pair = 0; pair < pairs; pair++) {
      this.newest = (this.newest + 1) % TAPS
      this.history[2 * this.newest] = samples[2 * pair] ?? 0
      this.history[2 * this.newest + 1] = samples[2 * pair + 1] ?? 0
      if (!this.second) {
        out[written++] = this.filtered(0)
        out[written++] = this.filtered(1)
      }
      this.second = !this.second
    }
    return out
  }

  /** The filter's output for `channel` (0 left, 1 right) at the newest pair. */
  private filtered(channel: number): number {
    let sum = 0
    for (const { offset, weight } of WEIGHTS) {
      sum += weight * (this.history[2 * ((this.newest - offset + TAPS) % TAPS) + channel] ?? 0)
    }
    return sum
  }
}
