// The mosaic of our platform layer's renderer (#43, plan B4), drawn natively in the host harness.
// Each scene follows GBATEK's "LCD I/O Mosaic Function": a mosaic block takes the colour of its
// upper left pixel, and the blocks count from the screen's first row and column.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  bgCnt,
  bgControl,
  DISPCNT_OBJ,
  DISPCNT_OBJ_1D,
  dispcntBg,
  drawFrame,
  pixel,
  REG,
  rgb,
  tile4,
  Video,
} from './wasm-layer-video.ts'
import type { DrawnFrame, Obj } from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-mosaic-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const BACKDROP = rgb(0, 0, 31)

/** A tile whose colour index differs between neighbouring pixels in both directions. */
const PATTERN = tile4(
  Array.from({ length: 8 }, (_, y) => '12345678'.slice(y) + '12345678'.slice(0, y)),
)

const mosaic = (bgH: number, bgV: number, objH = 0, objV = 0) =>
  bgH | (bgV << 4) | (objH << 8) | (objV << 12)

/** BG1 shows PATTERN over the whole screen, with colour index i as rgb(2i, i, 0). */
function patternBg(withMosaic: boolean): Video {
  const video = new Video()
    .io16(REG.DISPCNT, dispcntBg(1))
    .io16(bgCnt(1), bgControl({ screenBase: 31, mosaic: withMosaic }))
    .bgColor(0, BACKDROP)
    .bgTile(0, 1, PATTERN)
    .bgFill(31, { tile: 1 })
  for (let i = 1; i < 16; i++) video.bgColor(i, rgb(2 * i, i, 0))
  return video
}

/** OBJ 0 as given, showing PATTERN with the same colours; every other OBJ off screen. */
function patternObj(obj: Obj): Video {
  const video = new Video()
    .io16(REG.DISPCNT, DISPCNT_OBJ | DISPCNT_OBJ_1D)
    .bgColor(0, BACKDROP)
    .objTile(0, PATTERN)
  for (let i = 1; i < 16; i++) video.objColor(i, rgb(2 * i, i, 0))
  for (let i = 0; i < 128; i++) video.obj(i, { x: 0, y: 160 })
  return video.obj(0, obj)
}

/** Every pixel of the area, as [x, y, colour]. */
function area(
  drawn: DrawnFrame,
  width: number,
  height: number,
  at = (x: number, y: number) => [x, y],
) {
  const pixels: number[][] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [fromX = 0, fromY = 0] = at(x, y)
      pixels.push([x, y, pixel(drawn, fromX, fromY)])
    }
  }
  return pixels
}

const blockStart = (size: number) => (x: number, y: number) => [x - (x % size), y - (y % size)]

describe('BG mosaic', () => {
  it('repeats the upper left pixel of each 4x4 block on a BG with its BGCNT bit 6', () => {
    const plain = drawFrame(host, patternBg(false))
    const drawn = drawFrame(host, patternBg(true).io16(REG.MOSAIC, mosaic(3, 3)))
    expect(area(drawn, 24, 24)).toEqual(area(plain, 24, 24, blockStart(4)))
  })

  it('takes the H-size and the V-size apart: 3 wide and 2 high', () => {
    const plain = drawFrame(host, patternBg(false))
    const drawn = drawFrame(host, patternBg(true).io16(REG.MOSAIC, mosaic(2, 1)))
    const at = (x: number, y: number) => [x - (x % 3), y - (y % 2)]
    expect(area(drawn, 24, 24)).toEqual(area(plain, 24, 24, at))
  })

  it('leaves a BG without BGCNT bit 6 alone, and so does MOSAIC 0', () => {
    const plain = drawFrame(host, patternBg(false))
    const noBit = drawFrame(host, patternBg(false).io16(REG.MOSAIC, mosaic(3, 3)))
    const sizeOne = drawFrame(host, patternBg(true).io16(REG.MOSAIC, mosaic(0, 0, 3, 3)))
    expect(area(noBit, 24, 24)).toEqual(area(plain, 24, 24))
    expect(area(sizeOne, 24, 24)).toEqual(area(plain, 24, 24))
  })
})

describe('OBJ mosaic', () => {
  it('repeats the upper left pixel of each 4x4 screen block on a sprite with its mosaic bit', () => {
    const plain = drawFrame(host, patternObj({ x: 8, y: 8 }))
    const drawn = drawFrame(
      host,
      patternObj({ x: 8, y: 8, mosaic: true }).io16(REG.MOSAIC, mosaic(0, 0, 3, 3)),
    )
    expect(area(drawn, 24, 24)).toEqual(area(plain, 24, 24, blockStart(4)))
  })

  it('leaves a block transparent whose upper left pixel lies outside the sprite', () => {
    const drawn = drawFrame(
      host,
      patternObj({ x: 2, y: 2, mosaic: true }).io16(REG.MOSAIC, mosaic(0, 0, 3, 3)),
    )
    const plain = drawFrame(host, patternObj({ x: 2, y: 2 }))
    expect([pixel(drawn, 3, 5), pixel(drawn, 5, 3), pixel(drawn, 5, 5)]).toEqual([
      BACKDROP,
      BACKDROP,
      pixel(plain, 4, 4),
    ])
  })

  it('leaves a sprite without its mosaic bit alone', () => {
    const plain = drawFrame(host, patternObj({ x: 8, y: 8 }))
    const drawn = drawFrame(host, patternObj({ x: 8, y: 8 }).io16(REG.MOSAIC, mosaic(3, 3, 3, 3)))
    expect(area(drawn, 24, 24)).toEqual(area(plain, 24, 24))
  })
})
