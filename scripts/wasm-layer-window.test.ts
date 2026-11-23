// The windows of our platform layer's renderer (#43, plan B4), drawn natively in the host
// harness. Each scene follows GBATEK's "LCD I/O Window Feature".
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
  DISPCNT_OBJ_WINDOW,
  DISPCNT_WIN0,
  DISPCNT_WIN1,
  dispcntBg,
  drawFrame,
  LAYER_OBJ,
  pixel,
  REG,
  rgb,
  row,
  solid4,
  tile4,
  Video,
  windowH,
  windowV,
} from './wasm-layer-video.ts'
import type { DrawnFrame } from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-window-'))
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
const BG0 = 1
const BG1 = 2

/**
 * BG0 (priority 0) red and BG1 (priority 1) green over the whole screen, so BG0 hides BG1 where
 * both show. OBJ colour 1 blue, OBJ tile 0 solid; every OBJ off screen.
 */
function twoBgs(dispcnt: number): Video {
  const video = new Video()
    .io16(REG.DISPCNT, dispcnt | dispcntBg(0) | dispcntBg(1) | DISPCNT_OBJ_1D)
    .io16(bgCnt(0), bgControl({ screenBase: 30 }))
    .io16(bgCnt(1), bgControl({ priority: 1, screenBase: 31 }))
    .bgColor(0, BACKDROP)
    .bgColor(1, RED)
    .bgColor(2, GREEN)
    .bgTile(0, 1, solid4(1))
    .bgTile(0, 2, solid4(2))
    .bgFill(30, { tile: 1 })
    .bgFill(31, { tile: 2 })
    .objColor(1, BLUE)
    .objTile(0, solid4(1))
  for (let i = 0; i < 128; i++) video.obj(i, { x: 0, y: 160 })
  return video
}

/** WIN0 on, with its edges and the layers inside; outside, both BGs. */
const win0 = (h: number, v: number, inside: number) =>
  twoBgs(DISPCNT_WIN0)
    .io16(REG.WIN0H, h)
    .io16(REG.WIN0V, v)
    .io16(REG.WININ, inside)
    .io16(REG.WINOUT, BG0 | BG1)

/** The x of each pixel of the row in the colour. */
const xsOf = (drawn: DrawnFrame, y: number, colour: number) =>
  row(drawn, y).flatMap((c, x) => (c === colour ? [x] : []))
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('window 0', () => {
  it('covers the whole screen with the battle setting 0-240 x 0-161, BG1 only inside', () => {
    const drawn = drawFrame(host, win0(windowH(0, 240), windowV(0, 161), BG1))
    for (const y of [0, 80, 159]) expect(xsOf(drawn, y, GREEN)).toEqual(span(0, 239))
  })

  it('takes X1 and Y1 as its first pixel and X2 and Y2 as one past its last', () => {
    const drawn = drawFrame(host, win0(windowH(16, 32), windowV(8, 24), BG1))
    expect(xsOf(drawn, 8, GREEN)).toEqual(span(16, 31))
    expect(xsOf(drawn, 23, GREEN)).toEqual(span(16, 31))
    expect(xsOf(drawn, 7, GREEN)).toEqual([])
    expect(xsOf(drawn, 24, GREEN)).toEqual([])
  })

  it('reads X2 above 240 or below X1 as 240, and Y2 above 160 or below Y1 as 160', () => {
    const wide = drawFrame(host, win0(windowH(100, 250), windowV(0, 160), BG1))
    expect(xsOf(wide, 0, GREEN)).toEqual(span(100, 239))
    const crossed = drawFrame(host, win0(windowH(200, 100), windowV(100, 50), BG1))
    expect(xsOf(crossed, 100, GREEN)).toEqual(span(200, 239))
    expect(xsOf(crossed, 159, GREEN)).toEqual(span(200, 239))
    expect(xsOf(crossed, 99, GREEN)).toEqual([])
  })

  it('is empty when X1 equals X2', () => {
    const drawn = drawFrame(host, win0(windowH(50, 50), windowV(0, 160), BG1))
    expect(xsOf(drawn, 0, RED)).toEqual(span(0, 239))
  })

  it('shows the backdrop where it enables no layer', () => {
    const drawn = drawFrame(host, win0(windowH(0, 8), windowV(0, 8), 0))
    expect(row(drawn, 0).slice(0, 9)).toEqual([...Array<number>(8).fill(BACKDROP), RED])
  })

  it('does nothing while DISPCNT bit 13 is clear', () => {
    const video = win0(windowH(0, 240), windowV(0, 160), BG1).io16(
      REG.DISPCNT,
      dispcntBg(0) | dispcntBg(1),
    )
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(RED)
  })

  it('needs the DISPCNT bit of a layer as well as its own', () => {
    const video = win0(windowH(0, 240), windowV(0, 160), BG0 | BG1).io16(
      REG.DISPCNT,
      DISPCNT_WIN0 | dispcntBg(1),
    )
    expect(pixel(drawFrame(host, video), 0, 0)).toBe(GREEN)
  })

  it('hides a sprite inside it without its OBJ bit, and shows it outside', () => {
    const video = win0(windowH(0, 120), windowV(0, 160), BG0 | BG1)
      .io16(REG.DISPCNT, DISPCNT_WIN0 | dispcntBg(0) | dispcntBg(1) | DISPCNT_OBJ | DISPCNT_OBJ_1D)
      .io16(REG.WINOUT, BG0 | BG1 | LAYER_OBJ)
      .obj(0, { x: 116, y: 0 })
    expect(row(drawFrame(host, video), 0).slice(115, 125)).toEqual([
      ...Array<number>(5).fill(RED),
      ...Array<number>(4).fill(BLUE),
      RED,
    ])
  })
})

describe('window 1', () => {
  it('takes WININ bits 8-13, and window 0 has priority where both cover a pixel', () => {
    const video = twoBgs(DISPCNT_WIN0 | DISPCNT_WIN1)
      .io16(REG.WIN0H, windowH(0, 20))
      .io16(REG.WIN0V, windowV(0, 160))
      .io16(REG.WIN1H, windowH(10, 30))
      .io16(REG.WIN1V, windowV(0, 160))
      .io16(REG.WININ, BG0 | (BG1 << 8))
      .io16(REG.WINOUT, 0)
    const drawn = drawFrame(host, video)
    expect(xsOf(drawn, 0, RED)).toEqual(span(0, 19))
    expect(xsOf(drawn, 0, GREEN)).toEqual(span(20, 29))
    expect(xsOf(drawn, 0, BACKDROP)).toEqual(span(30, 239))
  })
})

describe('the OBJ window', () => {
  /** An OBJ-window sprite at (40, 40) whose left four columns are opaque; outside BG0 only. */
  function objWindow(dispcnt: number): Video {
    return twoBgs(dispcnt | DISPCNT_OBJ_WINDOW | DISPCNT_OBJ)
      .objTile(1, tile4(Array<string>(8).fill('11110000')))
      .obj(0, { x: 40, y: 40, tile: 1, mode: 'window' })
      .io16(REG.WINOUT, BG0 | (BG1 << 8))
  }

  it('opens WINOUT bits 8-13 where its sprite is opaque, and shows no colour of its own', () => {
    const drawn = drawFrame(host, objWindow(0))
    expect(row(drawn, 40).slice(38, 46)).toEqual([RED, RED, GREEN, GREEN, GREEN, GREEN, RED, RED])
    expect(xsOf(drawn, 47, GREEN)).toEqual(span(40, 43))
    expect(xsOf(drawn, 48, GREEN)).toEqual([])
    expect(xsOf(drawn, 40, BLUE)).toEqual([])
  })

  it('needs DISPCNT bit 12 as well as bit 15', () => {
    const video = objWindow(0).io16(
      REG.DISPCNT,
      DISPCNT_OBJ_WINDOW | dispcntBg(0) | dispcntBg(1) | DISPCNT_OBJ_1D,
    )
    expect(pixel(drawFrame(host, video), 40, 40)).toBe(RED)
  })

  it('lies under window 0', () => {
    const video = objWindow(DISPCNT_WIN0)
      .io16(REG.WIN0H, windowH(0, 42))
      .io16(REG.WIN0V, windowV(0, 160))
      .io16(REG.WININ, 0)
    expect(row(drawFrame(host, video), 40).slice(40, 45)).toEqual([
      BACKDROP,
      BACKDROP,
      GREEN,
      GREEN,
      RED,
    ])
  })
})
