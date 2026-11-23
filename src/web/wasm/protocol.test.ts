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

/** How a test game meets the clock: the frame it is at when asked first, and the gap between asks. */
interface Walk {
  frame?: number
  gap?: number
}

/**
 * Asks the clock every `gap` ms (an animation frame of 16 ms by default) from `from` to `to` for
 * a game that keeps up: it is at `frame` at the first ask and has played every frame granted by
 * each later one. Returns every answer.
 */
function grants(clock: TickClock, from: number, to: number, walk: Walk = {}): number[] {
  const gap = walk.gap ?? 16
  const answers = [clock.allowed(from, walk.frame ?? 0) ?? 0]
  for (let now = from + gap; now < to; now += gap)
    answers.push(clock.allowed(now, answers.at(-1) ?? 0) ?? 0)
  answers.push(clock.allowed(to, answers.at(-1) ?? 0) ?? 0)
  return answers
}

/** The last answer of `grants`. */
const walk = (clock: TickClock, from: number, to: number, frame = 0): number | undefined =>
  grants(clock, from, to, { frame }).at(-1)

/** The old clock's answer: every frame the elapsed time pays for, counted from `from` at `frame`. */
const paid = (speed: '1x' | '2x', from: number, now: number, frame = 0): number =>
  frame + Math.floor(((now - from) * (ticksPerSecond(speed) ?? 0)) / 1000)

/** The most the clock grants ahead of the game's frame and the frames owed since the last ask. */
const LEAD = { '1x': 30, '2x': 60 } as const

/**
 * Plays `speed` for 1 s, stalls the game for 2 s (it reports one frame) with an ask every `gap`
 * ms, then keeps up for 1 s. Checks at every ask of the stall that the grant stays within the
 * frames one gap pays for plus the lead; returns the frame the stall held and the grants at the
 * stall's end and 1 s later.
 */
function stall(speed: '1x' | '2x', gap = 16): { held: number; after: number; later: number } {
  const clock = new TickClock(speed, 0)
  const held = walk(clock, 0, 1000) ?? 0
  const most = held + Math.ceil((gap * (ticksPerSecond(speed) ?? 0)) / 1000) + LEAD[speed]
  for (let now = 1000 + gap; now < 3000; now += gap) {
    expect(clock.allowed(now, held)).toBeLessThanOrEqual(most)
  }
  const after = clock.allowed(3000, held) ?? 0
  expect(after).toBeLessThanOrEqual(most)
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

  // A page that asks late (a busy machine draws fewer animation frames) owes the game every frame
  // since its last ask, so a game that keeps up gets what the old clock from the start gave.
  it.each([
    ['1x', 16],
    ['1x', 150],
    ['1x', 400],
    ['2x', 16],
    ['2x', 150],
    ['2x', 400],
  ] as const)(
    'grants a game that keeps up at %s every frame the time pays for, asked every %i ms',
    (speed, gap) => {
      const clock = new TickClock(speed, 1000, 30)
      const answers = grants(clock, 1000, 31_000, { frame: 30, gap })
      const times = answers.map((_, index) => Math.min(1000 + index * gap, 31_000))
      expect(answers).toEqual(times.map((now) => paid(speed, 1000, now, 30)))
    },
  )

  // A slow start, a busy machine or a phone can hold the game back while the tab stays in view.
  // The clock drops that debt: the game goes on at its pace from the frame it reached, and never
  // races to catch up, which would also overflow the sound ring.
  it.each([16, 150, 400])(
    'grants a game that stalled 2 s at 1x no burst, asked every %i ms',
    (gap) => {
      const { held, after, later } = stall('1x', gap)
      expect(held).toBe(59)
      expect(after - held).toBeGreaterThanOrEqual(LEAD['1x'])
      expect(later - after).toBeGreaterThanOrEqual(59)
      expect(later - after).toBeLessThanOrEqual(60)
    },
  )

  it.each([16, 150, 400])(
    'grants a game that stalled 2 s at 2x no burst, asked every %i ms',
    (gap) => {
      const { held, after, later } = stall('2x', gap)
      expect(held).toBe(119)
      expect(after - held).toBeGreaterThanOrEqual(LEAD['2x'])
      expect(later - after).toBeGreaterThanOrEqual(119)
      expect(later - after).toBeLessThanOrEqual(120)
    },
  )

  it('loses no frame to a late animation frame when the game used its grant', () => {
    const clock = new TickClock('1x', 0)
    expect(walk(clock, 0, 1000)).toBe(59)
    expect(clock.allowed(1600, 59)).toBe(95)
    expect(clock.allowed(1616, 95)).toBe(96)
  })

  // The probe of S4-15: animation frames up to 450 ms apart in a loaded headless Chromium, and a
  // game still 28 frames behind its grant at the next ask, as it works through the late burst.
  it.each(['1x', '2x'] as const)(
    'loses no frame at %s when the next ask finds the game 28 frames behind',
    (speed) => {
      const clock = new TickClock(speed, 0)
      const held = walk(clock, 0, 1000) ?? 0
      expect(clock.allowed(1450, held)).toBe(paid(speed, 0, 1450))
      expect(clock.allowed(1480, paid(speed, 0, 1480) - 28)).toBe(paid(speed, 0, 1480))
      expect(walk(clock, 1480, 2480, paid(speed, 0, 1480))).toBe(paid(speed, 0, 2480))
    },
  )

  it('drops only the frames the game left unused before a late ask', () => {
    const clock = new TickClock('1x', 0)
    expect(walk(clock, 0, 1000)).toBe(59)
    // 39 of the 59 granted frames lay unused: the game gets the 36 frames since and the lead.
    expect(clock.allowed(1600, 20)).toBe(20 + 36 + LEAD['1x'])
    expect(clock.allowed(1616, 86)).toBe(87)
  })

  it('never takes back a frame it granted', () => {
    const clock = new TickClock('1x', 0)
    walk(clock, 0, 1000)
    expect(clock.allowed(2000, 59)).toBe(119)
    expect(clock.allowed(2016, 59)).toBe(119)
    expect(clock.allowed(2032, 60)).toBe(119)
    expect(clock.allowed(2048, 119)).toBe(120)
  })

  it('never lowers its grant while the game lags by changing amounts', () => {
    const clock = new TickClock('2x', 0)
    let granted = 0
    let now = 0
    for (let ask = 1; ask < 400; ask += 1) {
      // Gaps of 16 to 176 ms, and a game 0 to 19 frames behind its grant.
      now += (ask % 5) * 40 + 16
      const next = clock.allowed(now, Math.max(0, granted - ((ask * 7) % 20))) ?? 0
      expect(next).toBeGreaterThanOrEqual(granted)
      granted = next
    }
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
