// The text backgrounds of our platform layer's renderer (#43, plan B3), drawn natively in the host
// harness. Each scene follows GBATEK's "LCD I/O BG Control", "LCD I/O BG Scrolling", "LCD VRAM BG
// Screen Data Format (BG Map)", "LCD VRAM Character Data" and "LCD Color Palettes".
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  bgCnt,
  bgControl,
  bgHofs,
  bgVofs,
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

const scratch = mkdtempSync(join(tmpdir(), 'irv-bg-'))
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

/** BG0 on, char base 0, screen base 31; colour 1 red, 2 green; tile 1 solid red. */
function oneBg(): Video {
  return new Video()
    .io16(REG.DISPCNT, dispcntBg(0))
    .io16(bgCnt(0), bgControl({ screenBase: 31 }))
    .bgColor(0, BACKDROP)
    .bgColor(1, RED)
    .bgColor(2, GREEN)
    .bgTile(0, 1, solid4(1))
}

/** The x of each pixel of the row that is not the backdrop. */
const drawnAt = (pixels: number[]) =>
  pixels.flatMap((colour, x) => (colour === BACKDROP ? [] : [x]))
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('a text background', () => {
  it('draws the tile at map (1, 2) at pixels 8-15 of lines 16-23, and the backdrop elsewhere', () => {
    const drawn = drawFrame(host, oneBg().bgMap(31, 1, 2, { tile: 1 }))
    expect(drawnAt(row(drawn, 16))).toEqual(span(8, 15))
    expect(drawnAt(row(drawn, 23))).toEqual(span(8, 15))
    expect(drawnAt(row(drawn, 15))).toEqual([])
    expect(drawnAt(row(drawn, 24))).toEqual([])
    expect(pixel(drawn, 8, 16)).toBe(RED)
  })

  it('moves left by HOFS 4 and up by VOFS 3', () => {
    const video = oneBg().bgMap(31, 1, 2, { tile: 1 }).io16(bgHofs(0), 4).io16(bgVofs(0), 3)
    const drawn = drawFrame(host, video)
    expect(drawnAt(row(drawn, 13))).toEqual(span(4, 11))
    expect(drawnAt(row(drawn, 21))).toEqual([])
  })

  it('wraps around its 256 pixels: HOFS 508 shows column 0 at x 4', () => {
    const drawn = drawFrame(host, oneBg().bgMap(31, 0, 0, { tile: 1 }).io16(bgHofs(0), 508))
    expect(drawnAt(row(drawn, 0))).toEqual(span(4, 11))
  })

  it('mirrors a tile with hflip and vflip', () => {
    const halves = tile4(['11112222', ...Array<string>(6).fill('00000000'), '22220000'])
    const video = oneBg().bgTile(0, 2, halves).bgMap(31, 0, 0, { tile: 2, hflip: true })
    const flipped = drawFrame(host, video.bgMap(31, 1, 0, { tile: 2, vflip: true }))
    expect(row(flipped, 0).slice(0, 8)).toEqual([
      ...Array<number>(4).fill(GREEN),
      ...Array<number>(4).fill(RED),
    ])
    expect(row(flipped, 0).slice(8, 16)).toEqual([
      ...Array<number>(4).fill(GREEN),
      ...Array<number>(4).fill(BACKDROP),
    ])
    expect(row(flipped, 7).slice(8, 16)).toEqual([
      ...Array<number>(4).fill(RED),
      ...Array<number>(4).fill(GREEN),
    ])
  })

  it('takes colour index 0 as transparent and a map entry palette as the bank', () => {
    const video = oneBg().bgTile(0, 2, tile4(Array<string>(8).fill('01000000')))
    video.bgColor(16 * 3 + 1, BLUE).bgMap(31, 0, 0, { tile: 2, palette: 3 })
    const drawn = drawFrame(host, video)
    expect(row(drawn, 0).slice(0, 3)).toEqual([BACKDROP, BLUE, BACKDROP])
  })

  it('reads 8 bpp tiles of 64 bytes from the whole palette', () => {
    const video = oneBg().io16(bgCnt(0), bgControl({ screenBase: 31, colors256: true }))
    video.bgColor(200, BLUE).bgTile(0, 3, solid8(200)).bgMap(31, 0, 0, { tile: 3 })
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(BLUE)
  })

  it('takes its tiles from the char base block in steps of 16 KB', () => {
    const video = oneBg().io16(bgCnt(0), bgControl({ screenBase: 31, charBase: 2 }))
    video.bgTile(2, 5, solid4(2)).bgMap(31, 0, 0, { tile: 5 })
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(GREEN)
  })

  it('draws nothing while its enable bit in DISPCNT is clear', () => {
    const video = oneBg().bgMap(31, 0, 0, { tile: 1 }).io16(REG.DISPCNT, 0)
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(BACKDROP)
  })
})

describe('the screen sizes', () => {
  // The block after SC0 holds tile 1 at its (0, 0); SC0 stays empty.
  const sized = (size: number, block: number) =>
    oneBg()
      .io16(bgCnt(0), bgControl({ screenBase: 28, size }))
      .bgMap(28 + block, 0, 0, { tile: 1 })

  it('puts SC1 right of SC0 at size 1', () => {
    expect(pixel(drawFrame(host, sized(1, 1).io16(bgHofs(0), 256)), 0, 0)).toBe(RED)
    expect(pixel(drawFrame(host, sized(1, 1)), 0, 0)).toBe(BACKDROP)
  })

  it('puts SC1 below SC0 at size 2', () => {
    expect(pixel(drawFrame(host, sized(2, 1).io16(bgVofs(0), 256)), 0, 0)).toBe(RED)
  })

  it('puts SC3 lower right at size 3', () => {
    const video = sized(3, 3).io16(bgHofs(0), 256).io16(bgVofs(0), 256)
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(RED)
  })

  it('wraps a 512-pixel map at 512, not 256', () => {
    const video = sized(1, 0).io16(bgHofs(0), 256)
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(BACKDROP)
  })
})

describe('the background priority', () => {
  // BG0 draws red at (0, 0) and BG1 green, each from its own screen block.
  const twoBgs = (priority0: number, priority1: number) =>
    oneBg()
      .io16(REG.DISPCNT, dispcntBg(0) | dispcntBg(1))
      .io16(bgCnt(0), bgControl({ screenBase: 31, priority: priority0 }))
      .io16(bgCnt(1), bgControl({ screenBase: 30, priority: priority1 }))
      .bgTile(0, 2, solid4(2))
      .bgMap(31, 0, 0, { tile: 1 })
      .bgMap(30, 0, 0, { tile: 2 })

  it('draws BG1 at priority 0 over BG0 at priority 1', () => {
    expect(pixel(drawFrame(host, twoBgs(1, 0)), 0, 0)).toBe(GREEN)
  })

  it('orders equal priorities by BG number', () => {
    expect(pixel(drawFrame(host, twoBgs(2, 2)), 0, 0)).toBe(RED)
  })

  it('shows the lower BG through the transparent pixels of the upper one', () => {
    const video = twoBgs(0, 1).bgMap(31, 0, 0, { tile: 0 })
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(GREEN)
  })
})
