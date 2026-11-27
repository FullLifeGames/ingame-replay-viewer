// A speed change of the running game (#50, #104): the speed radio and END both call it. DOM-free,
// so a Node spec holds it; it reads the frame the game is at, restarts the tick rule (clock.ts)
// from there and writes the control words (protocol.ts).
import type { TickClock } from './clock'
import { readStatus, type Speed, writePace } from './protocol'

/** Changes the run of `control` and `clock` to `speed` at `now`, from the frame the game is at. */
export function changeSpeed(
  control: Int32Array,
  clock: TickClock,
  speed: Speed,
  now: number,
): void {
  clock.change(speed, now, readStatus(control).frame)
  writePace(control, speed)
}
