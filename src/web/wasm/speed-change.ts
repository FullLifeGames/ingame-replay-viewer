// A speed change of the running game (#50, #104): the speed radio and END both call it. DOM-free,
// so a Node spec holds it; it reads the frame the game is at, restarts the tick rule (clock.ts)
// from there and writes the control words (protocol.ts).
import type { TickClock } from './clock'
import { grant, readStatus, type Speed, writePace } from './protocol'

/**
 * Changes the run of `control` and `clock` to `speed` at `now`, from the frame the game is at, and
 * grants the new speed's frames at once: a pause keeps its held grant. Leaving fast, the grant
 * comes before the pace, so the worker stops at the frame of the switch before its sound turns on;
 * entering fast, the pace comes first, so the sound is off before the worker runs uncapped. Left
 * to the next draw, the fast grant let the worker run on with its sound on (docs/sound-skip.md).
 */
export function changeSpeed(
  control: Int32Array,
  clock: TickClock,
  speed: Speed,
  now: number,
): void {
  const frame = readStatus(control).frame
  clock.change(speed, now, frame)
  if (speed === 'fast') writePace(control, speed)
  grant(control, clock.allowed(now, frame))
  if (speed !== 'fast') writePace(control, speed)
}
