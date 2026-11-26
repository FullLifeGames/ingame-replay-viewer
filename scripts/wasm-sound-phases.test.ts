import { describe, expect, it } from 'vitest'

import { phaseLines, type SoundSample, splitPhases } from './wasm-sound-phases.ts'

// A reading at `t` ms on `frame`, with the ring's counters and the audio clock as given.
const at = (t: number, frame: number, counts: Partial<SoundSample> = {}): SoundSample => ({
  t,
  frame,
  ended: false,
  speed: '1x',
  written: 0,
  read: 0,
  skipped: 0,
  overruns: 0,
  underruns: 0,
  clock: undefined,
  ...counts,
})

// A run at fast with no sound to END at frame 100, then a burst of 40 frames in one draw at 1x,
// a stall, and the game in step again.
const RUN = [
  at(0, 0, { speed: 'fast', clock: 1 }),
  at(250, 100, { speed: 'fast', clock: 1.25 }),
  at(300, 101, { ended: true, clock: 1.3 }),
  at(500, 141, { ended: true, written: 56_320, read: 47_910, skipped: 39_496, clock: 1.5 }),
  at(1200, 142, { ended: true, written: 57_728, read: 57_728, skipped: 39_496, underruns: 1 }),
  at(2400, 150, { ended: true, written: 69_000, read: 68_000, skipped: 39_496, underruns: 1 }),
  at(4000, 240, { ended: true, written: 195_000, read: 194_000, skipped: 39_496, underruns: 1 }),
]

describe('splitPhases', () => {
  it('splits at the mark and after its window, each phase from its first reading to its last', () => {
    const [before, atEnd, after] = splitPhases(RUN, 2, 2000)
    expect(before).toMatchObject({ phase: 'before', ms: 300, frames: 101, written: 0, skipped: 0 })
    expect(atEnd).toMatchObject({
      phase: 'at',
      ms: 900,
      frames: 41,
      written: 57_728,
      read: 57_728,
      played: 18_232,
      skipped: 39_496,
      underruns: 1,
      fillMax: 8410,
      fillEnd: 0,
    })
    expect(after).toMatchObject({ phase: 'after', ms: 2800, frames: 98, written: 137_272 })
  })

  it('gives the largest frame step and draw gap of each phase', () => {
    const [before, atEnd] = splitPhases(RUN, 2, 2000)
    expect(before).toMatchObject({ stepMax: 100, gapMax: 250 })
    expect(atEnd).toMatchObject({ stepMax: 40, gapMax: 700 })
  })

  it('gives the audio clock against the wall clock where both ends have one', () => {
    const [before, atEnd] = splitPhases(RUN, 2, 2000)
    expect(before?.clockRatio).toBeCloseTo(1)
    expect(atEnd?.clockRatio).toBeUndefined()
  })

  it('leaves the after phase out when the run stopped inside the window', () => {
    expect(splitPhases(RUN.slice(0, 5), 2, 2000).map((r) => r.phase)).toEqual(['before', 'at'])
  })

  it('refuses a mark outside the readings or on the first one', () => {
    expect(() => splitPhases(RUN, 7, 2000)).toThrow('the mark 7 lies outside the 7 readings')
    expect(() => splitPhases(RUN, 0, 2000)).toThrow('the mark 0 lies outside the 7 readings')
  })
})

describe('phaseLines', () => {
  it('prints a header and one right-aligned line per phase, with a dash for no clock', () => {
    const lines = phaseLines(splitPhases(RUN.slice(0, 5), 2, 2000))
    expect(lines).toHaveLength(3)
    expect(lines[0]?.trim().split(/\s+/)).toEqual([
      'phase',
      'ms',
      'frames',
      'written',
      'read',
      'played',
      'skipped',
      'overruns',
      'underruns',
      'fillMax',
      'fillEnd',
      'stepMax',
      'gapMax',
      'clockRatio',
    ])
    expect(lines[1]?.trim().split(/\s+/)).toEqual([
      'before',
      '300',
      '101',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '100',
      '250',
      '1',
    ])
    expect(lines[2]?.trim().split(/\s+/).at(-1)).toBe('-')
    expect(new Set(lines.map((line) => line.length)).size).toBe(1)
  })
})
