// The probe of a sprite at rest (#71): the frame after shows the sprite that the frame before
// shows elsewhere, at the place the game's coordinates give it. A sprite has clear pixels, and the
// field behind them differs between the two places, so the frames never match pixel for pixel.
// The probe slides the window of the frame before sideways, a pixel at a time up to `reach` each
// way, and counts the pixels of the window that differ from the frame after's region. The sprite's
// own pixels line up at one offset only, and there the count drops: at offset 0 when the sprite
// stands in the region. A sprite a pixel off leaves its edges differing too, so the count at the
// next offsets stands well above; a region without the sprite gives no such drop.
import type { Frame, Region, Verdict } from './rom-shot-probes.ts'

export interface PlacedCheck {
  probe: 'placed'
  /** The frame that shows the sprite at rest, and the frame whose region must hold it. */
  before: string
  after: string
  /** Where the frame before shows the sprite, and where the frame after must show it. */
  from: Region
  to: Region
  /** The sideways offsets tried each way, in pixels. */
  reach: number
}

// At its place a sprite's count is at most this share of the count a pixel off on either side.
// Measured on 993907's far trainer in both engines: 524 pixels at the place, 1190 and 1191 a pixel
// off (a share of 0.44); on hand-made's empty far field 1331 against 1330 and 1330. Both engines
// pass it on the seven test replays that the far side wins: 524 pixels at the place and 1190 a
// pixel off on six of them, 514 and 1146 on 994128 (0.45).
const SHARP_SHARE = 0.75

// The pixel as 0xRRGGBB.
function colourAt(frame: Frame, x: number, y: number): number {
  const at = (y * frame.width + x) * 3
  return ((frame.rgb[at] ?? 0) << 16) | ((frame.rgb[at + 1] ?? 0) << 8) | (frame.rgb[at + 2] ?? 0)
}

function differingAt(before: Frame, after: Frame, check: PlacedCheck, offset: number): number {
  const { from, to } = check
  let count = 0
  for (let y = 0; y < to.height; y++) {
    for (let x = 0; x < to.width; x++) {
      const was = colourAt(before, from.x + offset + x, from.y + y)
      if (colourAt(after, to.x + x, to.y + y) !== was) count++
    }
  }
  return count
}

/** The count at each offset from -reach to reach; the window must stay on the frame before. */
export function placedCounts(before: Frame, after: Frame, check: PlacedCheck): number[] {
  const { from, to, reach } = check
  if (from.width !== to.width || from.height !== to.height) {
    throw new Error('the placed probe needs two regions of one size')
  }
  if (from.x - reach < 0 || from.x + from.width + reach > before.width) {
    throw new Error(`the placed probe's window leaves the frame at a reach of ${String(reach)}`)
  }
  const offsets = Array.from({ length: 2 * reach + 1 }, (_, i) => i - reach)
  return offsets.map((offset) => differingAt(before, after, check, offset))
}

// The sprite in the frame after stands `shift` pixels right of the region when the window of the
// frame before matches best `shift` pixels left of the sprite's place.
function whereShifted(shift: number): string {
  const pixels = Math.abs(shift) === 1 ? '1 pixel' : `${String(Math.abs(shift))} pixels`
  return `${pixels} ${shift > 0 ? 'right' : 'left'} of its place`
}

export function placedVerdict(before: Frame, after: Frame, check: PlacedCheck): Verdict {
  const counts = placedCounts(before, after, check)
  const { reach } = check
  const at = counts[reach] ?? 0
  const best = Math.min(...counts)
  const nextBest = Math.min(counts[reach - 1] ?? at, counts[reach + 1] ?? at)
  const detail = `${String(at)} pixels differ in place, ${String(nextBest)} a pixel off`
  if (counts.filter((count) => count === best).length > 1) {
    return { pass: false, detail: `${detail}; ${String(best)} at more than one offset` }
  }
  if (best < at) {
    const shift = reach - counts.indexOf(best)
    return { pass: false, detail: `${detail}; the best match stands ${whereShifted(shift)}` }
  }
  return { pass: at <= SHARP_SHARE * nextBest, detail }
}
