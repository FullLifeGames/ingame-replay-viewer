// The sprites (OBJs) of our platform layer's renderer (#43, plan B3), drawn natively in the host
// harness. Each scene follows GBATEK's "LCD OBJ - Overview", "LCD OBJ - OAM Attributes", "LCD
// OBJ - OAM Rotation/Scaling Parameters" and "LCD OBJ - VRAM Character (Tile) Mapping".
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
  row,
  solid4,
  solid8,
  tile4,
  Video,
} from './wasm-layer-video.ts'
import type { Obj } from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-obj-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const BACKDROP = rgb(1, 2, 3)
const RED = rgb(31, 0, 0)
const GREEN = rgb(0, 31, 0)
const BLUE = rgb(0, 0, 31)

/** OBJs on with 1D mapping; OBJ colour 1 red, 2 green; OBJ tiles 0-63 solid red. */
function sprites(...objs: Obj[]): Video {
  const video = new Video()
    .io16(REG.DISPCNT, DISPCNT_OBJ | DISPCNT_OBJ_1D)
    .bgColor(0, BACKDROP)
    .objColor(1, RED)
    .objColor(2, GREEN)
  for (let tile = 0; tile < 64; tile++) video.objTile(tile, solid4(1))
  // Everything else off screen: y 160 with an 8x8 size reaches no visible line.
  for (let i = 0; i < 128; i++) video.obj(i, { x: 0, y: 160 })
  objs.forEach((obj, i) => video.obj(i, obj))
  return video
}

const drawnAt = (pixels: number[]) =>
  pixels.flatMap((colour, x) => (colour === BACKDROP ? [] : [x]))
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('a regular sprite', () => {
  it('covers its size from its x and y', () => {
    const drawn = drawFrame(host, sprites({ x: 20, y: 30, size: 1 }))
    expect(drawnAt(row(drawn, 30))).toEqual(span(20, 35))
    expect(drawnAt(row(drawn, 45))).toEqual(span(20, 35))
    expect(drawnAt(row(drawn, 46))).toEqual([])
    expect(pixel(drawn, 20, 30)).toBe(RED)
  })

  it('starts 12 pixels left of the screen at x 500 and shows its columns 12-15 at x 0-3', () => {
    expect(drawnAt(row(drawFrame(host, sprites({ x: 500, y: 0, size: 1 })), 0))).toEqual(span(0, 3))
  })

  it('wraps at y 256: at y 250 its rows 6-15 reach lines 0-9', () => {
    const drawn = drawFrame(host, sprites({ x: 0, y: 250, size: 1 }))
    expect(drawnAt(row(drawn, 9))).toEqual(span(0, 15))
    expect(drawnAt(row(drawn, 10))).toEqual([])
  })

  it('has the sizes of its shape: horizontal size 2 is 32x16, vertical size 0 is 8x16', () => {
    const drawn = drawFrame(
      host,
      sprites({ x: 0, y: 0, shape: 1, size: 2 }, { x: 100, y: 0, shape: 2, size: 0 }),
    )
    expect(drawnAt(row(drawn, 15))).toEqual([...span(0, 31), ...span(100, 107)])
    expect(drawnAt(row(drawn, 16))).toEqual([])
  })

  it('mirrors with hflip', () => {
    const video = sprites({ x: 0, y: 0, tile: 64, hflip: true })
    video.objTile(64, tile4(Array<string>(8).fill('11222222')))
    expect(row(drawFrame(host, video), 0).slice(0, 8)).toEqual([
      ...Array<number>(6).fill(GREEN),
      RED,
      RED,
    ])
  })

  it('takes the next tile row 32 tiles on with 2D mapping and right after the row with 1D', () => {
    const video = sprites({ x: 0, y: 0, size: 1, tile: 64 })
    video.objTile(66, solid4(2)).objTile(96, solid4(2))
    expect(pixel(drawFrame(host, video), 0, 8)).toBe(GREEN)
    video.io16(REG.DISPCNT, DISPCNT_OBJ)
    expect(pixel(drawFrame(host, video), 0, 8)).toBe(GREEN)
    video.objTile(66, solid4(1))
    expect(pixel(drawFrame(host, video), 0, 8)).toBe(GREEN)
    video.objTile(96, solid4(1))
    expect(pixel(drawFrame(host, video), 0, 8)).toBe(RED)
  })

  it('reads 8 bpp tiles as two steps of 32 bytes from the OBJ palette', () => {
    const video = sprites({ x: 0, y: 0, size: 1, tile: 64, colors256: true })
    video.objColor(200, BLUE)
    for (const tile of [64, 66, 68, 70]) video.objTile(tile, solid8(200))
    const drawn = drawFrame(host, video)
    expect([pixel(drawn, 0, 0), pixel(drawn, 15, 15)]).toEqual([BLUE, BLUE])
  })

  it('takes a palette bank and colour index 0 as transparent', () => {
    const video = sprites({ x: 0, y: 0, tile: 64, palette: 5 })
    video.objTile(64, tile4(Array<string>(8).fill('01000000'))).objColor(5 * 16 + 1, BLUE)
    expect(row(drawFrame(host, video), 0).slice(0, 3)).toEqual([BACKDROP, BLUE, BACKDROP])
  })

  it('is hidden by its disable bit, and all are hidden while DISPCNT bit 12 is clear', () => {
    expect(pixel(drawFrame(host, sprites({ x: 0, y: 0, disabled: true })), 0, 0)).toBe(BACKDROP)
    const off = sprites({ x: 0, y: 0 }).io16(REG.DISPCNT, DISPCNT_OBJ_1D)
    expect(pixel(drawFrame(host, off), 0, 0)).toBe(BACKDROP)
  })
})

describe('an affine sprite', () => {
  it('equals the regular sprite with the identity matrix', () => {
    const video = sprites({ x: 10, y: 10, size: 1, affine: 0 }).objAffine(0, [256, 0, 0, 256])
    const drawn = drawFrame(host, video)
    expect(drawnAt(row(drawn, 10))).toEqual(span(10, 25))
    expect(drawnAt(row(drawn, 26))).toEqual([])
  })

  it('scaled 2x covers twice its width only with double size', () => {
    const scaled = (doubleSize: boolean) =>
      sprites({ x: 40, y: 40, size: 1, affine: 3, doubleSize }).objAffine(3, [128, 0, 0, 128])
    expect(drawnAt(row(drawFrame(host, scaled(false)), 47))).toEqual(span(40, 55))
    const double = drawFrame(host, scaled(true))
    expect(drawnAt(row(double, 47))).toEqual(span(40, 71))
    expect(drawnAt(row(double, 71))).toEqual(span(40, 71))
    expect(drawnAt(row(double, 72))).toEqual([])
  })

  it('rotates about its centre: a quarter turn moves the left column to the top row', () => {
    // GBATEK: the centre is at half the width and height; texel x = (PA*dx + PB*dy) >> 8 + 4.
    const video = sprites({ x: 0, y: 0, tile: 64, affine: 1 }).objAffine(1, [0, 256, -256, 0])
    video.objTile(64, tile4(Array<string>(8).fill('21111111')))
    const drawn = drawFrame(host, video)
    expect(row(drawn, 0).slice(0, 8)).toEqual([BACKDROP, ...Array<number>(7).fill(GREEN)])
    expect(row(drawn, 1).slice(0, 8)).toEqual([BACKDROP, ...Array<number>(7).fill(RED)])
  })
})

describe('the sprite order', () => {
  it('puts the lower OAM index on top', () => {
    const video = sprites({ x: 0, y: 0, tile: 64 }, { x: 0, y: 0, tile: 65 })
    video.objTile(64, solid4(2)).objTile(65, solid4(1))
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(GREEN)
  })

  // BG0 at priority 0 draws blue over the whole first tile.
  const overBg = (priority: number) => {
    const video = sprites({ x: 0, y: 0, priority })
    video.io16(REG.DISPCNT, DISPCNT_OBJ | DISPCNT_OBJ_1D | dispcntBg(0))
    video.io16(bgCnt(0), bgControl({ screenBase: 31, charBase: 0 })).bgColor(1, BLUE)
    return video.bgTile(0, 1, solid4(1)).bgMap(31, 0, 0, { tile: 1 })
  }

  it('draws a sprite of priority 1 under BG0 of priority 0', () => {
    expect(pixel(drawFrame(host, overBg(1)), 0, 0)).toBe(BLUE)
  })

  it('draws a sprite over a BG of the same priority', () => {
    expect(pixel(drawFrame(host, overBg(0)), 0, 0)).toBe(RED)
  })
})

describe('the OBJ cycles of a line', () => {
  // GBATEK "LCD OBJ - Overview": 1210 cycles per line; a regular OBJ costs its width, here 64.
  const budget = (before: number) => {
    const wide: Obj[] = Array.from({ length: before }, () => ({ x: 300, y: 0, size: 3 }))
    return sprites(...wide, { x: 0, y: 0 })
  }

  it('counts sprites off screen too, and draws one that ends at 18 * 64 + 8 = 1160 cycles', () => {
    expect(pixel(drawFrame(host, budget(18)), 0, 0)).toBe(RED)
  })

  it('draws nothing after the sprite that runs out: 19 * 64 = 1216 cycles', () => {
    expect(pixel(drawFrame(host, budget(19)), 0, 0)).toBe(BACKDROP)
  })
})
