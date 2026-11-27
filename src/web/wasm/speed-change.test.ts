import { describe, expect, it } from 'vitest'

import { TickClock } from './clock'
import {
  CONTROL,
  createShared,
  grant,
  readPace,
  type Speed,
  waitForTick,
  writePace,
  writeStatus,
} from './protocol'
import { changeSpeed } from './speed-change'

const progress = { done: 3, total: 34, turn: 1, error: 0, finished: false, playing: true }

/** The control words of a run at `speed` whose game reached `frame`, granted as the draw does. */
function running(speed: Speed, frame: number): { control: Int32Array; clock: TickClock } {
  const control = new Int32Array(createShared(64).control)
  const clock = new TickClock(speed, 0)
  writePace(control, speed)
  writeStatus(control, frame, progress)
  grant(control, clock.allowed(0, frame))
  return { control, clock }
}

const word = (control: Int32Array, name: keyof typeof CONTROL) =>
  Atomics.load(control, CONTROL[name])

// #104: a change that left the fast grant to the next draw let the worker run uncapped with its
// sound on until then (docs/sound-skip.md).
describe('a speed change', () => {
  it('holds the game at the frame of the switch when it leaves fast for 1x', () => {
    const { control, clock } = running('fast', 1000)
    expect(word(control, 'fast')).toBe(1)
    changeSpeed(control, clock, '1x', 5000)
    expect(word(control, 'fast')).toBe(0)
    expect(word(control, 'allowed')).toBe(1000)
    expect(readPace(control)).toBe(1)
    // The worker that handed over the next frame waits for the clock.
    expect(waitForTick(control, 1001, 0)).toBe(false)
    expect(clock.speed).toBe('1x')
  })

  it('holds the game at the frame of the switch when it leaves fast for 2x', () => {
    const { control, clock } = running('fast', 1000)
    changeSpeed(control, clock, '2x', 5000)
    expect(word(control, 'fast')).toBe(0)
    expect(word(control, 'allowed')).toBe(1000)
    expect(readPace(control)).toBe(2)
  })

  it('silences the sound and lifts the grant when it enters fast', () => {
    const { control, clock } = running('1x', 500)
    expect(word(control, 'fast')).toBe(0)
    changeSpeed(control, clock, 'fast', 5000)
    expect(readPace(control)).toBe(0)
    expect(word(control, 'fast')).toBe(1)
    expect(waitForTick(control, 501, 0)).toBe(true)
  })

  it('keeps a paused game at its held grant across a change to 1x and back to fast', () => {
    const { control, clock } = running('fast', 1000)
    grant(control, clock.pause(1000))
    changeSpeed(control, clock, '1x', 5000)
    expect([word(control, 'fast'), word(control, 'allowed'), readPace(control)]).toEqual([
      0, 1000, 1,
    ])
    changeSpeed(control, clock, 'fast', 6000)
    expect([word(control, 'fast'), word(control, 'allowed'), readPace(control)]).toEqual([
      0, 1000, 0,
    ])
    expect(clock.paused).toBe(true)
  })
})
