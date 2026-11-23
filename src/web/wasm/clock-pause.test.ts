import { describe, expect, it } from 'vitest'

import { TickClock } from './clock'

/** Asks every 16 ms from `from` to `to` for a game that plays every frame granted; the last answer. */
function walk(clock: TickClock, from: number, to: number, frame: number): number | undefined {
  let answer = clock.allowed(from, frame)
  for (let now = from + 16; now <= to; now += 16) answer = clock.allowed(now, answer ?? frame)
  return clock.allowed(to, answer ?? frame)
}

/** A clock at 1x that granted 59 frames in its first second; the specs pause its game at 40. */
function behind(): TickClock {
  const clock = new TickClock('1x', 0)
  expect(walk(clock, 0, 1000, 0)).toBe(59)
  return clock
}

// The worker waits for a grant at or above the frame it handed over (protocol.ts, waitForTick), so
// a pause that granted each asked frame would let the game step one frame per ask (D11).
describe('the pause', () => {
  it('grants no frame while paused, however long it waits', () => {
    const clock = behind()
    expect(clock.paused).toBe(false)
    expect(clock.pause(40)).toBe(40)
    expect(clock.paused).toBe(true)
    for (const now of [1000, 1016, 5000, 60_000, 3_600_000]) {
      expect(clock.allowed(now, 41)).toBe(40)
    }
  })

  // The only place the grant falls outside a speed change: the game stops where it stands.
  it('lowers its grant to the frame of the pause', () => {
    const clock = behind()
    clock.pause(40)
    clock.play(1000)
    expect(clock.allowed(1000, 40)).toBe(40)
  })

  it('counts on from the frame of the pause after play', () => {
    const clock = behind()
    clock.pause(40)
    clock.play(9000)
    expect(clock.paused).toBe(false)
    expect(clock.allowed(9000, 41)).toBe(40)
    expect(walk(clock, 9000, 10_000, 41)).toBe(40 + 59)
  })

  // A hidden tab that comes back resumes the clock; a pause the viewer chose stays.
  it('keeps a pause when the tab comes back', () => {
    const clock = behind()
    clock.pause(40)
    clock.resume(9000)
    expect(clock.paused).toBe(true)
    expect(clock.allowed(9016, 41)).toBe(40)
    expect(clock.allowed(20_000, 41)).toBe(40)
  })

  it('keeps a pause through a speed change and plays at the new speed', () => {
    const clock = behind()
    clock.pause(40)
    clock.change('2x', 2000, 41)
    expect(clock.paused).toBe(true)
    expect(clock.speed).toBe('2x')
    expect(clock.allowed(3000, 41)).toBe(40)
    clock.play(4000)
    expect(walk(clock, 4000, 5000, 41)).toBe(41 + 119)
  })

  it('holds a fast game at the frame of the pause, and stays fast after play', () => {
    const clock = new TickClock('fast', 0)
    expect(clock.allowed(1000, 5000)).toBeUndefined()
    expect(clock.pause(5000)).toBe(5000)
    expect(clock.allowed(9000, 5001)).toBe(5000)
    clock.play(9000)
    expect(clock.allowed(9000, 5001)).toBeUndefined()
    expect(clock.speed).toBe('fast')
  })

  it('pauses again after play, at the new frame', () => {
    const clock = behind()
    clock.pause(40)
    clock.play(2000)
    walk(clock, 2000, 3000, 40)
    expect(clock.pause(90)).toBe(90)
    expect(clock.allowed(10_000, 91)).toBe(90)
  })

  it('leaves a clock that plays as it is when asked to play', () => {
    const clock = behind()
    clock.play(5000)
    expect(clock.paused).toBe(false)
    expect(clock.allowed(1016, 59)).toBe(60)
  })
})
