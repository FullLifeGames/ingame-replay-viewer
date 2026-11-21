import { crc32, deflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { countColours } from './png-colours.ts'

type Pixel = readonly number[]

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toUpLeft = Math.abs(estimate - upLeft)
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

const PREDICTORS = [
  () => 0,
  (left: number) => left,
  (_left: number, up: number) => up,
  (left: number, up: number) => (left + up) >> 1,
  paeth,
]

/** A PNG of `rows`, each row filtered with `filters[y % filters.length]`, as an encoder would. */
function png(
  rows: readonly (readonly Pixel[])[],
  filters: readonly number[],
  colourType = 2,
): Buffer {
  const bpp = colourType === 6 ? 4 : 3
  const width = rows[0]?.length ?? 0
  const raw = rows.map((row) => Buffer.from(row.flat()))
  const filtered = raw.map((row, y) => {
    const filter = filters[y % filters.length] ?? 0
    const predict = PREDICTORS[filter] ?? (() => 0)
    const out = Buffer.alloc(row.length + 1)
    out[0] = filter
    row.forEach((value, x) => {
      const left = x >= bpp ? (row[x - bpp] ?? 0) : 0
      const up = y > 0 ? (raw[y - 1]?.[x] ?? 0) : 0
      const upLeft = x >= bpp && y > 0 ? (raw[y - 1]?.[x - bpp] ?? 0) : 0
      out[x + 1] = (value - predict(left, up, upLeft)) & 0xff
    })
    return out
  })
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(rows.length, 4)
  header.writeUInt8(8, 8)
  header.writeUInt8(colourType, 9)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(filtered))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const grid = (width: number, height: number, at: (x: number, y: number) => Pixel) =>
  Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => at(x, y)))

const BLACK: Pixel = [0, 0, 0]
const PALETTE: readonly Pixel[] = [
  [248, 248, 248],
  [40, 120, 200],
  [200, 40, 40],
  [16, 200, 96],
]

describe('countColours', () => {
  it('counts one colour in a black frame, as a game screen before its first picture', () => {
    expect(
      countColours(
        png(
          grid(240, 160, () => BLACK),
          [0],
        ),
        16,
      ),
    ).toBe(1)
  })

  it.each([0, 1, 2, 3, 4])('reads rows written with filter %i', (filter) => {
    const rows = grid(12, 6, (x, y) => PALETTE[(x + 2 * y) % 4] ?? BLACK)
    expect(countColours(png(rows, [filter]), 16)).toBe(4)
  })

  it('reads a frame whose rows switch filters, as Chromium writes them', () => {
    const rows = grid(30, 20, (x, y) => [x * 8, y * 12, (x * y) & 0xff])
    const distinct = new Set(rows.flat().map((pixel) => pixel.join())).size
    expect(countColours(png(rows, [4, 1, 2, 3, 0]), 1000)).toBe(distinct)
  })

  it('reads RGBA and counts alpha as part of the colour', () => {
    const rows = grid(4, 4, (x) => [10, 20, 30, x < 2 ? 255 : 0])
    expect(countColours(png(rows, [1, 4], 6), 16)).toBe(2)
  })

  it('stops counting at the cap', () => {
    const rows = grid(64, 4, (x, y) => [x * 4, y * 60, 0])
    expect(countColours(png(rows, [0]), 16)).toBe(16)
  })

  it('refuses a palette PNG, which it cannot read', () => {
    expect(() =>
      countColours(
        png(
          grid(2, 2, () => BLACK),
          [0],
          3,
        ),
        16,
      ),
    ).toThrow('the PNG is not 8-bit RGB or RGBA without interlace')
  })

  it('refuses bytes without an IHDR chunk', () => {
    expect(() => countColours(Buffer.alloc(8), 16)).toThrow('the PNG has no IHDR chunk')
  })
})
