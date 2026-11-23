import { describe, expect, it } from 'vitest'

import { TickClock } from './clock'
import { ticksPerSecond } from './protocol'

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

/** The most the clock pays per ask of the frames owed since the last one: one second of play. */
const SECOND = { '1x': 60, '2x': 120 } as const

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

describe('the tick rule', () => {
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
    ['1x', 450],
    ['1x', 1000],
    ['2x', 16],
    ['2x', 150],
    ['2x', 400],
    ['2x', 450],
    ['2x', 1000],
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

  it('never takes back a frame it granted at one speed', () => {
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

  // The page itself can stop asking while the tab stays in view: a busy main thread, such as a
  // dump picked during a run. One ask then owes the game the whole gap; the clock pays one second
  // of it, so the burst fits the sound ring, and drops the rest.
  it.each(['1x', '2x'] as const)('pays one second of a 5 s gap in the asks at %s', (speed) => {
    const clock = new TickClock(speed, 0)
    const held = walk(clock, 0, 1000) ?? 0
    const capped = held + SECOND[speed] + LEAD[speed]
    expect(clock.allowed(6000, held)).toBe(capped)
    const later = walk(clock, 6000, 7000, capped) ?? 0
    expect(later - capped).toBeGreaterThanOrEqual(SECOND[speed] - 1)
    expect(later - capped).toBeLessThanOrEqual(SECOND[speed])
  })

  // A first animation frame after a hidden spell can come before visibilitychange calls resume.
  it('pays one second to an ask 10 s after the tab hid that comes before resume', () => {
    const clock = new TickClock('1x', 0)
    expect(walk(clock, 0, 1000)).toBe(59)
    const capped = 59 + SECOND['1x'] + LEAD['1x']
    expect(clock.allowed(11_000, 59)).toBe(capped)
    clock.resume(11_010)
    expect(clock.allowed(11_010, capped)).toBe(capped)
    expect(walk(clock, 11_010, 12_010, capped)).toBe(capped + 59)
  })

  // A switch drops what the game owes and the lead: the new pace counts from the game's frame,
  // so the grant can fall. The worker only waits for its grant, so it loses nothing it played.
  it.each([
    ['2x', '1x'],
    ['1x', '2x'],
  ] as const)('counts from the frame of a game 50 frames behind after %s to %s', (from, to) => {
    const clock = new TickClock(from, 0)
    const frame = (walk(clock, 0, 1000) ?? 0) - 50
    clock.change(to, 1000, frame)
    expect(clock.speed).toBe(to)
    expect(clock.allowed(1000, frame)).toBe(frame)
    const most = frame + Math.ceil((16 * (ticksPerSecond(to) ?? 0)) / 1000) + LEAD[to]
    for (let now = 1016; now < 2000; now += 16) {
      expect(clock.allowed(now, frame)).toBeLessThanOrEqual(most)
    }
  })

  // An animation frame's time stamp can lie before the performance.now() that the start, a change
  // or resume read; the clock counts such an ask as one at its own start.
  it('counts an ask before its start or its resume as an ask at that moment', () => {
    const clock = new TickClock('1x', 1000)
    expect(clock.allowed(990, 0)).toBe(0)
    expect(clock.allowed(1016, 0)).toBe(0)
    expect(clock.allowed(1017, 0)).toBe(1)
    expect(walk(clock, 1017, 2000, 1)).toBe(59)
    clock.resume(5000)
    expect(clock.allowed(4990, 59)).toBe(59)
    expect(walk(clock, 5000, 6000, 59)).toBe(59 + 59)
  })
})
