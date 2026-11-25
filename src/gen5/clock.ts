// The spike page's clock (#72): Black 2 reads the DS's real-time clock for its seasons and, with
// the frame timing, for its random seed. melonDS's core asks the browser for the time through
// Emscripten (`clock_time_get` → `Date.now`), so the page answers with a clock that starts at a
// fixed local time and runs with the emulated frames. A route then meets the same clock at the
// same frame on any device, and a state saved at frame N goes on at the time of frame N.
import { DS_FRAME_RATE } from './pace.ts'

/** Noon on 1 January 2000, local time: the Gen 3 backend's fixed clock. */
export const CLOCK_START = { year: 2000, monthIndex: 0, day: 1, hour: 12 }

/** The clock in milliseconds at emulated frame `frame`, from `startMs` at frame 0. */
export function clockMs(startMs: number, frame: number): number {
  return startMs + Math.floor((frame * 1000) / DS_FRAME_RATE)
}
