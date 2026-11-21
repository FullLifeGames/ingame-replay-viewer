import { describe, expect, it } from 'vitest'

import { FRAME_BYTES } from './frame'
import {
  AudioRing,
  CONTROL,
  createShared,
  GBA_FRAMES_PER_SECOND,
  grant,
  readStatus,
  SPEEDS,
  TickClock,
  ticksPerSecond,
  waitForTick,
  writeStatus,
} from './protocol'

const progress = { done: 3, total: 34, turn: 1, error: 0, finished: false, playing: true }

describe('the tick rule', () => {
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

  it('allows the frames that the elapsed time pays for, counted from its start', () => {
    const clock = new TickClock('1x', 1000)
    expect(clock.allowed(1000)).toBe(0)
    expect(clock.allowed(1016)).toBe(0)
    expect(clock.allowed(1017)).toBe(1)
    expect(clock.allowed(2000)).toBe(59)
    expect(clock.allowed(61_000)).toBe(3583)
  })

  it('sets no limit at fast, and counts from the frame the game is at after a change', () => {
    const clock = new TickClock('fast', 0)
    expect(clock.allowed(5000)).toBeUndefined()
    clock.change('2x', 5000, 1234)
    expect(clock.speed).toBe('2x')
    expect(clock.allowed(5000)).toBe(1234)
    expect(clock.allowed(6000)).toBe(1234 + 119)
    clock.change('1x', 6000, 1300)
    expect(clock.allowed(7000)).toBe(1300 + 59)
  })
})

describe('the shared buffers', () => {
  it('hold one RGBA frame of 240x160x4 bytes, the control words and the audio ring', () => {
    const shared = createShared(1024)
    expect(shared.frame.byteLength).toBe(FRAME_BYTES)
    expect(shared.frame.byteLength).toBe(240 * 160 * 4)
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

  it('never waits at fast, and waits again after a speed with ticks', () => {
    const control = new Int32Array(createShared(16).control)
    grant(control, undefined)
    expect(waitForTick(control, 100_000, 0)).toBe(true)
    grant(control, 3)
    expect(control[CONTROL.fast]).toBe(0)
    expect(waitForTick(control, 100_000, 0)).toBe(false)
  })
})

describe('the audio ring', () => {
  it('wraps around its end and hands the samples out in order', () => {
    const ring = new AudioRing(createShared(4).audio)
    expect(ring.push(Float32Array.of(1, 2, 3))).toBe(0)
    const out = new Float32Array(4)
    expect(ring.pull(out.subarray(0, 2))).toBe(2)
    expect(ring.push(Float32Array.of(4, 5, 6))).toBe(0)
    expect(ring.pull(out)).toBe(4)
    expect([...out]).toEqual([3, 4, 5, 6])
    expect(ring.pull(out)).toBe(0)
    expect(ring.overruns).toBe(0)
  })

  it('drops what does not fit and reports an overrun', () => {
    const ring = new AudioRing(createShared(4).audio)
    expect(ring.push(Float32Array.of(1, 2, 3))).toBe(0)
    expect(ring.push(Float32Array.of(4, 5, 6))).toBe(2)
    expect(ring.overruns).toBe(1)
    const out = new Float32Array(4)
    expect(ring.pull(out)).toBe(4)
    expect([...out]).toEqual([1, 2, 3, 4])
  })

  it('refuses a capacity that is not a positive whole number', () => {
    expect(() => createShared(0)).toThrow(
      'the audio ring needs a capacity of 1 or more samples, not 0',
    )
  })
})
