import { describe, expect, it } from 'vitest'

import {
  DS_FRAME_RATE,
  LOOP_CHUNK,
  loopCount,
  paceBetween,
  paceLine,
  paceOver,
  paceWindows,
} from './pace'

describe('paceBetween', () => {
  it('gives 600 frames in 10 s as 60 fps and 1.003 of the DS rate', () => {
    const pace = paceBetween({ ms: 1_000, frame: 100 }, { ms: 11_000, frame: 700 })
    expect(pace.seconds).toBe(10)
    expect(pace.frames).toBe(600)
    expect(pace.fps).toBe(60)
    expect(pace.ratio).toBeCloseTo(1.003, 3)
    expect(DS_FRAME_RATE).toBeCloseTo(59.8261, 4)
  })

  it('refuses a span with no time in it', () => {
    expect(() => paceBetween({ ms: 5, frame: 0 }, { ms: 5, frame: 10 })).toThrow('no time')
  })
})

describe('paceWindows', () => {
  // Samples once a second: 60 fps for 10 s, then 30 fps for 10 s, then 4 s of a cut window.
  const samples = Array.from({ length: 25 }, (_, second) => ({
    ms: second * 1000,
    frame: second <= 10 ? second * 60 : 600 + (second - 10) * 30,
  }))

  it('cuts the samples into whole windows and drops the cut tail', () => {
    const windows = paceWindows(samples, 10_000)
    expect(windows.map((w) => w.fps)).toEqual([60, 30])
    expect(windows.map((w) => w.startMs)).toEqual([0, 10_000])
  })

  it('gives no window when the samples span less than one', () => {
    expect(paceWindows(samples.slice(0, 5), 10_000)).toEqual([])
  })
})

describe('paceOver', () => {
  // Samples once a second: 30 fps for 50 s, then 10 fps for 20 s.
  const samples = Array.from({ length: 71 }, (_, second) => ({
    ms: second * 1000,
    frame: second <= 50 ? second * 30 : 1500 + (second - 50) * 10,
  }))

  it('measures from the last sample back to the earliest one inside the span', () => {
    expect(paceOver(samples, 5_000)?.fps).toBe(10)
    expect(paceOver(samples, 5_000)?.seconds).toBe(5)
    expect(paceOver(samples, 60_000)?.fps).toBeCloseTo((1700 - 300) / 60, 6)
  })

  it('takes what there is when the samples span less than the span', () => {
    expect(paceOver(samples.slice(0, 3), 60_000)?.seconds).toBe(2)
  })

  it('gives none for fewer than two samples', () => {
    expect(paceOver(samples.slice(0, 1), 5_000)).toBeUndefined()
    expect(paceOver([], 5_000)).toBeUndefined()
  })
})

describe('paceLine', () => {
  it('names the rate, the share of the DS rate and the span', () => {
    const pace = paceBetween({ ms: 0, frame: 0 }, { ms: 30_000, frame: 450 })
    expect(paceLine(pace)).toBe('15.0 fps, 0.251 of the DS rate (450 frames in 30.0 s)')
  })
})

describe('loopCount', () => {
  it('counts the loop turns until the clock passes the span', () => {
    let tick = 0
    const now = () => tick++
    // The clock reads 0 at the start and 1 to 9 inside the span, so nine chunks run.
    expect(loopCount(10, now)).toBe(9 * LOOP_CHUNK)
  })
})
