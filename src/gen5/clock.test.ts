import { describe, expect, it } from 'vitest'

import { CLOCK_START, clockMs } from './clock'

// Scene: Black 2 reads the real-time clock (seasons by month, the RNG's seed); a route repeats only
// when the clock reads the same at the same emulated frame, however fast the device runs.
describe('clockMs', () => {
  it('starts at the start and runs with the emulated frames, not the wall clock', () => {
    expect(clockMs(1_000, 0)).toBe(1_000)
    expect(clockMs(0, 1)).toBe(16)
    expect(clockMs(0, 598_261)).toBe(10_000_000)
  })

  it('starts at noon on 1 January 2000, as the Gen 3 backend does', () => {
    expect(CLOCK_START).toEqual({ year: 2000, monthIndex: 0, day: 1, hour: 12 })
  })
})
