import { describe, expect, it } from 'vitest'

import { AudioMeter, audioHandler, Resampler, RingReader, SoundPace } from './audio'
import { HalfBand } from './half-band'
import { createShared, MIXER_RATE, writePace } from './protocol'
import { AudioRing } from './ring'

const stereo = (...frames: [number, number][]) => Float32Array.from(frames.flat())

function ringOf(samples: Float32Array, capacity = 64): AudioRing {
  const ring = new AudioRing(createShared(capacity).audio)
  ring.push(samples)
  return ring
}

function fill(resampler: Resampler, frames: number): [number[], number[]] {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  resampler.fill(left, right)
  return [[...left], [...right]]
}

describe('the audio pace', () => {
  const frame = stereo([1, 2], [3, 4], [5, 6], [7, 8], [9, 10])

  it('keeps every frame at pace 1', () => {
    expect([...new SoundPace().apply(stereo([1, 2], [3, 4]), 1)]).toEqual([1, 2, 3, 4])
  })

  it('filters and keeps one pair of each two at pace 2, so the sound plays twice as fast', () => {
    expect([...new SoundPace().apply(frame, 2)]).toEqual([...new HalfBand().decimate(frame)])
  })

  it('keeps nothing at pace 0', () => {
    expect(new SoundPace().apply(stereo([1, 2]), 0)).toHaveLength(0)
  })

  it('starts the filter afresh when the pace changes', () => {
    const pace = new SoundPace()
    pace.apply(stereo([8, 8], [8, 8], [8, 8]), 2)
    pace.apply(frame, 1)
    expect([...pace.apply(frame, 2)]).toEqual([...new HalfBand().decimate(frame)])
  })

  it('refuses a pace the worker has no rule for', () => {
    expect(() => new SoundPace().apply(frame, 3)).toThrow(
      'the page asks for the sound at pace 3, and the worker plays it at 0, 1 or 2',
    )
  })
})

describe('the audio hook of the worker', () => {
  const memory = new Uint8Array(64)
  new Float32Array(memory.buffer, 16, 4).set([0.5, -0.5, 0.25, -0.25])

  function setUp(pace: '1x' | '2x' | 'fast') {
    const buffers = createShared(16)
    writePace(new Int32Array(buffers.control), pace)
    const handler = audioHandler(() => ({ HEAPU8: memory }), buffers)
    return { handler, ring: new AudioRing(buffers.audio) }
  }

  it("moves the frame's samples from the module's memory into the ring", () => {
    const { handler, ring } = setUp('1x')
    handler(16, 4, MIXER_RATE)
    const out = new Float32Array(4)
    expect(ring.pull(out)).toBe(4)
    expect([...out]).toEqual([0.5, -0.5, 0.25, -0.25])
  })

  it('moves every other pair at 2x and nothing at fast', () => {
    const double = setUp('2x')
    double.handler(16, 4, MIXER_RATE)
    expect(double.ring.totalWritten).toBe(2)
    const fast = setUp('fast')
    fast.handler(16, 4, MIXER_RATE)
    expect(fast.ring.totalWritten).toBe(0)
  })

  it('refuses samples at a rate the page does not resample from', () => {
    const { handler } = setUp('1x')
    expect(() => {
      handler(16, 4, 42060)
    }).toThrow('the game mixes at 42060 Hz, and the page resamples from 42048 Hz')
  })
})

describe('the resampler of the audio worklet', () => {
  it('splits the ring into left and right at the same rate', () => {
    const resampler = new Resampler(ringOf(stereo([1, -1], [2, -2], [3, -3])), 48000, 48000)
    expect(fill(resampler, 3)).toEqual([
      [1, 2, 3],
      [-1, -2, -3],
    ])
  })

  it('goes on from where the last fill ended', () => {
    const resampler = new Resampler(ringOf(stereo([1, 0], [2, 0], [3, 0], [4, 0])), 1, 1)
    fill(resampler, 2)
    expect(fill(resampler, 2)[0]).toEqual([3, 4])
  })

  it('takes every other frame from a rate twice the output', () => {
    const ring = ringOf(stereo([0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]))
    expect(fill(new Resampler(ring, 2, 1), 3)[0]).toEqual([0, 2, 4])
  })

  it('draws a line between two frames for a rate half the output', () => {
    const ring = ringOf(stereo([0, 0], [2, 4], [4, 8]))
    expect(fill(new Resampler(ring, 1, 2), 4)).toEqual([
      [0, 1, 2, 3],
      [0, 2, 4, 6],
    ])
  })

  it('plays silence once the ring runs dry and counts the dry spell once', () => {
    const ring = ringOf(stereo([1, 1]))
    expect(fill(new Resampler(ring, 1, 1), 3)[0]).toEqual([1, 0, 0])
    expect(ring.underruns).toBe(1)
  })

  // The worklet starts before the worker's first frame, which is no underrun.
  it('counts no dry spell before the first sample arrives', () => {
    const ring = ringOf(stereo())
    const resampler = new Resampler(ring, 1, 1)
    fill(resampler, 4)
    expect(ring.underruns).toBe(0)
    ring.push(stereo([1, 1], [2, 2]))
    expect(fill(resampler, 2)[0]).toEqual([1, 2])
    expect(ring.underruns).toBe(0)
    expect(fill(resampler, 2)[0]).toEqual([0, 0])
    expect(ring.underruns).toBe(1)
  })

  it('refuses a rate that is not positive', () => {
    expect(() => new Resampler(ringOf(stereo()), 0, 48000)).toThrow(
      'the resampler needs two positive rates, not 0 Hz and 48000 Hz',
    )
  })
})

describe('the ring reader of the audio worklet', () => {
  function setUp(samples: Float32Array, reserve = 4) {
    const buffer = createShared(64).audio
    const ring = new AudioRing(buffer)
    ring.push(samples)
    return { ring, reader: new RingReader({ ring: buffer, rate: 1, latency: 8, reserve }, 1) }
  }

  function outputs(frames: number): Float32Array[][] {
    return [[new Float32Array(frames), new Float32Array(frames)]]
  }

  function play(reader: RingReader, frames: number): number[] {
    const out = outputs(frames)
    reader.process(out)
    return [...(out[0]?.[0] ?? [])]
  }

  it('plays the ring into the left and right outputs, held at the latency cap', () => {
    const { ring, reader } = setUp(stereo([1, -1], [2, -2], [3, -3], [4, -4], [5, -5], [6, -6]))
    const out = outputs(2)
    expect(reader.process(out)).toBe(true)
    expect(out[0]?.map((channel) => [...channel])).toEqual([
      [5, 6],
      [-5, -6],
    ])
    expect(ring.skipped).toBe(8)
  })

  it('plays silence and counts no underrun until its reserve waits, then plays it in order', () => {
    const { ring, reader } = setUp(stereo([1, 1], [2, 2]), 6)
    expect(play(reader, 4)).toEqual([0, 0, 0, 0])
    expect(ring.totalRead).toBe(0)
    ring.push(stereo([3, 3]))
    expect(play(reader, 3)).toEqual([1, 2, 3])
    expect(ring.underruns).toBe(0)
  })

  it('waits for its reserve again after a dry spell, and counts the dry spell once', () => {
    const { ring, reader } = setUp(stereo([1, 1], [2, 2], [3, 3]), 6)
    play(reader, 3)
    expect(play(reader, 2)).toEqual([0, 0])
    ring.push(stereo([4, 4], [5, 5]))
    expect(play(reader, 2)).toEqual([0, 0])
    ring.push(stereo([6, 6]))
    expect(play(reader, 3)).toEqual([4, 5, 6])
    expect(ring.underruns).toBe(1)
    expect(play(reader, 1)).toEqual([0])
    expect(ring.underruns).toBe(2)
  })

  it('refuses a reserve above the latency cap, which it could never fill', () => {
    expect(() => setUp(stereo(), 10)).toThrow(
      'the audio reserve of 10 samples is above the latency cap of 8, so the worklet would never play',
    )
  })

  it('stops for good once the page stops it, so the audio thread can drop it', () => {
    const { ring, reader } = setUp(stereo([1, 1], [2, 2]))
    reader.stop()
    const out = outputs(1)
    expect(reader.process(out)).toBe(false)
    expect([...(out[0]?.[0] ?? [])]).toEqual([0])
    expect(ring.totalRead).toBe(0)
  })
})

describe('the audio meter', () => {
  it('counts the samples and gives their root mean square', () => {
    const meter = new AudioMeter()
    meter.add(Float32Array.of(3, -4))
    meter.add(Float32Array.of(0, 0))
    expect(meter.samples).toBe(4)
    expect(meter.rms).toBeCloseTo(2.5)
  })

  it('gives 0 before any sample', () => {
    expect(new AudioMeter().rms).toBe(0)
  })
})
