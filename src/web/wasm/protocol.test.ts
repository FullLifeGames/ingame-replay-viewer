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
  TickClock,
  ticksPerSecond,
  waitForTick,
  writePace,
  writeStatus,
} from './protocol'
import { AudioRing } from './ring'

/**
 * Asks the clock every animation frame of 16 ms from `from` to `to` for a game that keeps up: it
 * is at `frame` at the first ask and has played every frame granted by each later one. Returns
 * the last answer.
 */
function walk(clock: TickClock, from: number, to: number, frame = 0): number | undefined {
  let granted = clock.allowed(from, frame) ?? frame
  for (let now = from + 16; now < to; now += 16) granted = clock.allowed(now, granted) ?? granted
  return clock.allowed(to, granted)
}

/** The most the clock grants ahead of the game's frame: 0.1 s of frames, rounded up. */
const LEAD = { '1x': 6, '2x': 12 } as const

/**
 * Plays `speed` for 1 s, stalls the game for 2 s (it reports one frame), then keeps up for 1 s.
 * Checks the lead at every ask of the stall; returns the frame the stall held and the grants at
 * the stall's end and 1 s later.
 */
function stall(speed: '1x' | '2x'): { held: number; after: number; later: number } {
  const clock = new TickClock(speed, 0)
  const held = walk(clock, 0, 1000) ?? 0
  for (let now = 1016; now < 3000; now += 16) {
    expect(clock.allowed(now, held)).toBeLessThanOrEqual(held + LEAD[speed])
  }
  const after = clock.allowed(3000, held) ?? 0
  return { held, after, later: walk(clock, 3000, 4000, after) ?? 0 }
}

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
    expect(clock.allowed(1000, 0)).toBe(0)
    expect(clock.allowed(1016, 0)).toBe(0)
    expect(clock.allowed(1017, 0)).toBe(1)
    expect(walk(clock, 1017, 2000, 1)).toBe(59)
    expect(walk(clock, 2000, 61_000, 59)).toBe(3583)
  })

  it('grants a game that keeps up 119 or 120 frames per second at 2x', () => {
    const clock = new TickClock('2x', 0)
    expect(walk(clock, 0, 1000)).toBe(119)
    expect(walk(clock, 1000, 61_000, 119)).toBe(7286)
  })

  it('sets no limit at fast, and counts from the frame the game is at after a change', () => {
    const clock = new TickClock('fast', 0)
    expect(clock.allowed(5000, 0)).toBeUndefined()
    clock.change('2x', 5000, 1234)
    expect(clock.speed).toBe('2x')
    expect(clock.allowed(5000, 1234)).toBe(1234)
    expect(walk(clock, 5000, 6000, 1234)).toBe(1234 + 119)
    clock.change('1x', 6000, 1300)
    expect(walk(clock, 6000, 7000, 1300)).toBe(1300 + 59)
  })

  // After END the game plays on; at fast that would keep a core busy until Restart.
  it('leaves fast for 1x at END and keeps 1x and 2x', () => {
    expect(SPEEDS.map(speedAtEnd)).toEqual(['1x', '2x', '1x'])
  })

  // A hidden tab gets no animation frame, so the page grants nothing and the game pauses. When
  // the tab comes back, the page resumes the clock, and the game goes on from there instead of
  // racing to catch up.
  it('resumes where it paused when the page comes back into view', () => {
    const clock = new TickClock('1x', 0)
    expect(walk(clock, 0, 1000)).toBe(59)
    clock.resume(9000)
    expect(clock.allowed(9000, 59)).toBe(59)
    expect(walk(clock, 9000, 9200, 59)).toBe(59 + 11)
    expect(walk(clock, 9200, 10_000, 59 + 11)).toBe(59 + 59)
  })

  // A slow start, a busy machine or a phone can hold the game back while the tab stays in view.
  // The clock drops that debt: the game goes on at its pace from the frame it reached, and never
  // races to catch up, which would also overflow the sound ring.
  it('grants a game that stalled 2 s at 1x no more than 6 frames ahead, then 60 per second', () => {
    const { held, after, later } = stall('1x')
    expect(held).toBe(59)
    expect(after).toBe(held + LEAD['1x'])
    expect(later - after).toBeGreaterThanOrEqual(59)
    expect(later - after).toBeLessThanOrEqual(60)
  })

  it('grants a game that stalled 2 s at 2x no more than 12 frames ahead, then 120 per second', () => {
    const { held, after, later } = stall('2x')
    expect(held).toBe(119)
    expect(after).toBe(held + LEAD['2x'])
    expect(later - after).toBeGreaterThanOrEqual(119)
    expect(later - after).toBeLessThanOrEqual(120)
  })

  it('grants no burst after a late ask while the page is in view', () => {
    const clock = new TickClock('1x', 0)
    expect(walk(clock, 0, 1000)).toBe(59)
    expect(clock.allowed(1600, 59)).toBe(59 + LEAD['1x'])
    expect(clock.allowed(1616, 65)).toBe(66)
  })

  it('never takes back a frame it granted', () => {
    const clock = new TickClock('1x', 0)
    walk(clock, 0, 1000)
    expect(clock.allowed(2000, 59)).toBe(65)
    expect(clock.allowed(2016, 59)).toBe(65)
    expect(clock.allowed(2032, 60)).toBe(66)
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
