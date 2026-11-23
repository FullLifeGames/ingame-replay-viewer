import { describe, expect, it } from 'vitest'

import { FRAME_BYTES } from './frame'
import {
  CONTROL,
  createShared,
  GBA_FRAMES_PER_SECOND,
  grant,
  MIXER_RATE,
  readPace,
  readStatus,
  SPEEDS,
  speedAtEnd,
  ticksPerSecond,
  waitForTick,
  writePace,
  writeStatus,
} from './protocol'
import { AudioRing } from './ring'

const progress = { done: 3, total: 34, turn: 1, error: 0, finished: false, playing: true }

describe('the speeds', () => {
  it('offers 1x, 2x and fast', () => {
    expect(SPEEDS).toEqual(['1x', '2x', 'fast'])
  })

  // The GBA draws 16777216 / 280896 frames per second: 228 lines of 1232 cycles at 16.78 MHz.
  it('gives 59.7275 ticks per second at 1x, twice that at 2x and none at fast', () => {
    expect(GBA_FRAMES_PER_SECOND).toBeCloseTo(59.7275, 4)
    expect(ticksPerSecond('1x')).toBeCloseTo(59.7275, 4)
    expect(ticksPerSecond('2x')).toBeCloseTo(119.455, 3)
    expect(ticksPerSecond('fast')).toBeUndefined()
  })

  // After END the game plays on; at fast that would keep a core busy until Restart.
  it('leaves fast for 1x at END and keeps 1x and 2x', () => {
    expect(SPEEDS.map(speedAtEnd)).toEqual(['1x', '2x', '1x'])
  })
})

describe('the shared buffers', () => {
  it('hold two RGBA frames of 240x160x4 bytes, the control words and the audio ring', () => {
    const shared = createShared(1024)
    expect(shared.frames.byteLength).toBe(2 * FRAME_BYTES)
    expect(FRAME_BYTES).toBe(240 * 160 * 4)
    expect(new Int32Array(shared.control).length).toBe(Object.keys(CONTROL).length)
    expect(new AudioRing(shared.audio).capacity).toBe(1024)
  })

  it('carry the frame count, the progress and the first finished frame to the page', () => {
    const control = new Int32Array(createShared(16).control)
    writeStatus(control, 10, progress)
    expect(readStatus(control)).toEqual({ frame: 10, finishedAt: 0, ...progress })
    writeStatus(control, 11, { ...progress, done: 34, finished: true })
    writeStatus(control, 12, { ...progress, done: 34, finished: true })
    expect(readStatus(control)).toMatchObject({ frame: 12, finishedAt: 11, finished: true })
  })
})

describe('the wait for a tick', () => {
  it('returns at once while the game is not ahead of the frames it may play', () => {
    const control = new Int32Array(createShared(16).control)
    grant(control, 5)
    expect(waitForTick(control, 5, 0)).toBe(true)
  })

  it('waits for the next grant when the game is ahead, and gives up after the timeout', () => {
    const control = new Int32Array(createShared(16).control)
    grant(control, 4)
    expect(waitForTick(control, 5, 5)).toBe(false)
  })

  // The worker checks the fast word, reads the allowed word and waits on what it read. A switch
  // to fast in between must change the word it waits on, or the wait outlasts the switch.
  it('wakes a worker that waits on the frames it read before a switch to fast', () => {
    const control = new Int32Array(createShared(16).control)
    grant(control, 4)
    const seen = Atomics.load(control, CONTROL.allowed)
    grant(control, undefined)
    expect(Atomics.wait(control, CONTROL.allowed, seen, 50)).toBe('not-equal')
    grant(control, 7)
    expect(Atomics.load(control, CONTROL.allowed)).toBe(7)
    expect(waitForTick(control, 8, 0)).toBe(false)
  })

  it('never waits at fast, and waits again after a speed with ticks', () => {
    const control = new Int32Array(createShared(16).control)
    grant(control, undefined)
    expect(waitForTick(control, 100_000, 0)).toBe(true)
    grant(control, 3)
    expect(control[CONTROL.fast]).toBe(0)
    expect(waitForTick(control, 100_000, 0)).toBe(false)
  })
})

describe('the audio pace', () => {
  it('plays at 1x and 2x and goes silent at fast', () => {
    const control = new Int32Array(createShared(4).control)
    const paces = SPEEDS.map((speed) => {
      writePace(control, speed)
      return readPace(control)
    })
    expect(paces).toEqual([1, 2, 0])
  })

  it('takes the mixer rate of 704 samples per GBA frame', () => {
    expect(MIXER_RATE).toBe(42048)
    expect(Math.round(MIXER_RATE / GBA_FRAMES_PER_SECOND)).toBe(704)
  })
})
