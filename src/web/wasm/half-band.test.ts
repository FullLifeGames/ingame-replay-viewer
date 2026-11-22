import { describe, expect, it } from 'vitest'

import { HalfBand } from './half-band'
import { MIXER_RATE } from './protocol'

const FRAME_PAIRS = 704

/** `pairs` left and right pairs of a sine at `hertz`, sampled at the mixer's rate. */
function sine(hertz: number, pairs: number, start = 0): Float32Array {
  const out = new Float32Array(2 * pairs)
  for (let pair = 0; pair < pairs; pair++) {
    const value = Math.sin((2 * Math.PI * hertz * (start + pair)) / MIXER_RATE)
    out[2 * pair] = value
    out[2 * pair + 1] = -value
  }
  return out
}

/** The 2x pick before #47: every other left and right pair, with no filter. */
function everyOtherPair(samples: Float32Array): Float32Array {
  return samples.filter((_, index) => index % 4 < 2)
}

/** The gain in decibels of the left channel, past the filter's first `settle` pairs. */
function gain(input: Float32Array, output: Float32Array, settle = 32): number {
  const rms = (samples: Float32Array) => {
    let squares = 0
    let count = 0
    for (let index = 2 * settle; index < samples.length; index += 2) {
      squares += (samples[index] ?? 0) ** 2
      count++
    }
    return Math.sqrt(squares / count)
  }
  return 20 * Math.log10(rms(output) / rms(input))
}

describe('the half-band filter before the 2x decimation', () => {
  it('passes a 1 kHz tone within 0.5 dB', () => {
    const input = sine(1000, 8 * FRAME_PAIRS)
    expect(Math.abs(gain(input, new HalfBand().decimate(input)))).toBeLessThan(0.5)
  })

  it('takes a 15 kHz tone down by 30 dB or more, which the old pick let through', () => {
    const input = sine(15_000, 8 * FRAME_PAIRS)
    expect(gain(input, everyOtherPair(input))).toBeGreaterThan(-1)
    expect(gain(input, new HalfBand().decimate(input))).toBeLessThan(-30)
  })

  it('keeps one pair of each two, left and right apart', () => {
    const input = sine(1000, 2 * FRAME_PAIRS)
    const output = new HalfBand().decimate(input)
    expect(output).toHaveLength(input.length / 2)
    for (let index = 0; index < output.length; index += 2) {
      expect(output[index + 1]).toBeCloseTo(-(output[index] ?? 0), 6)
    }
  })

  it('leaves no step at a frame boundary: two frames in two calls equal one call over both', () => {
    const both = sine(3000, 2 * FRAME_PAIRS)
    const once = new HalfBand().decimate(both)
    const split = new HalfBand()
    const first = split.decimate(both.subarray(0, 2 * FRAME_PAIRS))
    const second = split.decimate(both.subarray(2 * FRAME_PAIRS))
    expect([...first, ...second]).toEqual([...once])
  })

  it('carries the pick of each second pair across a frame of an odd count', () => {
    const both = sine(3000, 2 * FRAME_PAIRS)
    const once = new HalfBand().decimate(both)
    const split = new HalfBand()
    const first = split.decimate(both.subarray(0, 2 * (FRAME_PAIRS - 1)))
    const second = split.decimate(both.subarray(2 * (FRAME_PAIRS - 1)))
    expect([...first, ...second]).toEqual([...once])
  })

  it('starts afresh after a reset, as at the first frame', () => {
    const input = sine(3000, FRAME_PAIRS)
    const fresh = new HalfBand().decimate(input)
    const used = new HalfBand()
    used.decimate(sine(5000, FRAME_PAIRS - 1))
    used.reset()
    expect([...used.decimate(input)]).toEqual([...fresh])
  })
})
