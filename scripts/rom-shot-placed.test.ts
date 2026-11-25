import { describe, expect, it } from 'vitest'

import { placedCounts, placedVerdict } from './rom-shot-placed.ts'
import type { PlacedCheck } from './rom-shot-placed.ts'
import type { Frame } from './rom-shot-probes.ts'

const WIDTH = 16
const HEIGHT = 2

// Two rows of grey levels as a frame.
function frameOf(top: readonly number[], bottom = top): Frame {
  const frame = { width: WIDTH, height: HEIGHT, rgb: new Uint8Array(WIDTH * HEIGHT * 3) }
  ;[top, bottom].forEach((levels, y) => {
    levels.forEach((level, x) =>
      frame.rgb.fill(level, (y * WIDTH + x) * 3, (y * WIDTH + x) * 3 + 3),
    )
  })
  return frame
}

// A sprite of four pixels, 1 to 4, at x 4 in the frame before, on a field of 90 left of x 8 and 80
// from there; its place in the frame after is x 8.
const SPRITE = [1, 2, 3, 4]
const row = (left: number) =>
  Array.from({ length: WIDTH }, (_, x) => SPRITE[x - left] ?? (x < 8 ? 90 : 80))
const check: PlacedCheck = {
  probe: 'placed',
  before: 'intro',
  after: 'outro',
  from: { x: 4, y: 0, width: 4, height: HEIGHT },
  to: { x: 8, y: 0, width: 4, height: HEIGHT },
  reach: 2,
}
const before = frameOf(row(4))

describe('placedCounts', () => {
  it('counts the differing pixels at each offset from -reach to reach', () => {
    expect(placedCounts(before, frameOf(row(8)), check)).toEqual([8, 8, 0, 8, 8])
  })

  it('refuses regions of two sizes and a window off the frame', () => {
    const wider = { ...check, to: { ...check.to, width: 5 } }
    expect(() => placedCounts(before, before, wider)).toThrow(/two regions of one size/)
    expect(() => placedCounts(before, before, { ...check, reach: 5 })).toThrow(/reach of 5/)
    const right = { ...check, from: { ...check.from, x: 11 } }
    expect(() => placedCounts(before, before, right)).toThrow(/leaves the frame/)
  })
})

describe('placedVerdict', () => {
  it('passes the sprite at its place, with the count a pixel off', () => {
    expect(placedVerdict(before, frameOf(row(8)), check)).toEqual({
      pass: true,
      detail: '0 pixels differ in place, 8 a pixel off',
    })
  })

  it('names how far right or left of its place the sprite stands', () => {
    expect(placedVerdict(before, frameOf(row(9)), check)).toEqual({
      pass: false,
      detail:
        '8 pixels differ in place, 2 a pixel off; the best match stands 1 pixel right of its place',
    })
    expect(placedVerdict(before, frameOf(row(6)), check).detail).toMatch(/2 pixels left/)
  })

  it('fails a region whose count drops at no single offset', () => {
    const field = frameOf(Array<number>(WIDTH).fill(80))
    expect(placedVerdict(field, field, check)).toEqual({
      pass: false,
      detail: '0 pixels differ in place, 0 a pixel off; 0 at more than one offset',
    })
  })

  it('fails a best match whose count stands above three quarters of the next offsets', () => {
    const top = row(8).map((level, x) => (x > 8 && x < 12 ? 9 : level))
    const bottom = row(8).map((level, x) => (x >= 8 && x < 12 ? 9 : level))
    expect(placedVerdict(before, frameOf(top, bottom), check)).toEqual({
      pass: false,
      detail: '7 pixels differ in place, 8 a pixel off',
    })
  })
})
