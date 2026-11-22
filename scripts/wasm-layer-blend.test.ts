// The colour special effects of our platform layer's renderer (#43, plan B4), drawn natively in
// the host harness. Each scene follows GBATEK's "LCD I/O Color Special Effects"; the integer form
// of its formulas (each product divided by 16 and rounded down) is ours, and the mGBA oracle
// checks it.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  BLEND_ALPHA,
  BLEND_DOWN,
  BLEND_UP,
  bgCnt,
  bgControl,
  bldcnt,
  DISPCNT_OBJ,
  DISPCNT_OBJ_1D,
  DISPCNT_WIN0,
  dispcntBg,
  drawFrame,
  LAYER_BACKDROP,
  LAYER_OBJ,
  pixel,
  REG,
  rgb,
  solid4,
  Video,
  WINDOW_EFFECT,
  windowH,
  windowV,
} from './wasm-layer-video.ts'
import type { Obj } from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-blend-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const BACKDROP = rgb(3, 5, 7)
const A = rgb(20, 10, 0)
const B = rgb(4, 30, 31)
const C = rgb(9, 9, 9)
const SPRITE = rgb(31, 1, 7)
const BG0 = 1
const BG1 = 2
const BG2 = 4
const BG3 = 8

/**
 * BG n (priority n, screen base 28 + n) covers the screen in colour n + 1 where it is listed;
 * colours: 1 A, 2 B, 3 C, 4 B. OBJ colour 1 SPRITE, OBJ tile 0 solid; every OBJ off screen
 * except the ones given, which go first in OAM.
 */
function layers(bgs: readonly number[], ...objs: Obj[]): Video {
  let dispcnt = DISPCNT_OBJ | DISPCNT_OBJ_1D
  const video = new Video().bgColor(0, BACKDROP).objColor(1, SPRITE).objTile(0, solid4(1))
  ;[A, B, C, B].forEach((colour, i) => video.bgColor(i + 1, colour).bgTile(0, i + 1, solid4(i + 1)))
  for (const bg of bgs) {
    dispcnt |= dispcntBg(bg)
    video.io16(bgCnt(bg), bgControl({ priority: bg, screenBase: 28 + bg }))
    video.bgFill(28 + bg, { tile: bg + 1 })
  }
  for (let i = 0; i < 128; i++) video.obj(i, { x: 0, y: 160 })
  objs.forEach((obj, i) => video.obj(i, obj))
  return video.io16(REG.DISPCNT, dispcnt)
}

const blend = (video: Video, control: number, eva: number, evb: number) =>
  video.io16(REG.BLDCNT, control).io16(REG.BLDALPHA, eva | (evb << 8))
const first = (video: Video) => pixel(drawFrame(host, video), 0, 0)

describe('alpha blending', () => {
  it('mixes the 1st target with the 2nd behind it: 8/16 of A and 8/16 of B, rounded down', () => {
    const video = blend(layers([0, 1]), bldcnt(BG0, BLEND_ALPHA, BG1), 8, 8)
    expect(first(video)).toBe(rgb(12, 20, 15))
  })

  it('takes each product over 16 and rounds the sum down: 3/16 and 5/16', () => {
    const video = blend(layers([0, 1]), bldcnt(BG0, BLEND_ALPHA, BG1), 3, 5)
    // r (60 + 20) / 16 = 5, g (30 + 150) / 16 = 11.25, b (0 + 155) / 16 = 9.69
    expect(first(video)).toBe(rgb(5, 11, 9))
  })

  it('clamps each channel at 31 and reads EVA and EVB above 16 as 16', () => {
    const video = blend(layers([0, 1]), bldcnt(BG0, BLEND_ALPHA, BG1), 20, 16)
    expect(first(video)).toBe(rgb(24, 31, 31))
  })

  it('shows the top pixel alone when the next one is no 2nd target', () => {
    expect(first(blend(layers([0, 1]), bldcnt(BG0, BLEND_ALPHA, BG2), 8, 8))).toBe(A)
  })

  it('shows the top pixel alone when it is no 1st target', () => {
    expect(first(blend(layers([0, 1]), bldcnt(BG1, BLEND_ALPHA, BG1), 8, 8))).toBe(A)
  })

  it('mixes only with the next layer down, not with a 2nd target behind a layer between', () => {
    expect(first(blend(layers([0, 1, 2]), bldcnt(BG0, BLEND_ALPHA, BG2), 8, 8))).toBe(A)
  })

  it('mixes with the backdrop as the 2nd target', () => {
    const video = blend(layers([0]), bldcnt(BG0, BLEND_ALPHA, LAYER_BACKDROP), 16, 16)
    expect(first(video)).toBe(rgb(23, 15, 7))
  })

  it('mixes a sprite as the 1st target with the BG behind it', () => {
    const video = blend(layers([1], { x: 0, y: 0 }), bldcnt(LAYER_OBJ, BLEND_ALPHA, BG1), 16, 0)
    expect(first(video)).toBe(SPRITE)
    blend(video, bldcnt(LAYER_OBJ, BLEND_ALPHA, BG1), 0, 16)
    expect(first(video)).toBe(B)
  })

  it('mixes a BG in front of a sprite with the sprite as the 2nd target', () => {
    const behind = layers([0], { x: 0, y: 0, priority: 1 })
    expect(first(blend(behind, bldcnt(BG0, BLEND_ALPHA, LAYER_OBJ), 0, 16))).toBe(SPRITE)
  })

  it('is cut where the window holds its effect bit clear', () => {
    const video = blend(layers([0, 1]), bldcnt(BG0, BLEND_ALPHA, BG1), 0, 16)
      .io16(REG.DISPCNT, DISPCNT_WIN0 | dispcntBg(0) | dispcntBg(1))
      .io16(REG.WIN0H, windowH(0, 1))
      .io16(REG.WIN0V, windowV(0, 160))
      .io16(REG.WININ, BG0 | BG1)
      .io16(REG.WINOUT, BG0 | BG1 | WINDOW_EFFECT)
    const drawn = drawFrame(host, video)
    expect([pixel(drawn, 0, 0), pixel(drawn, 1, 0)]).toEqual([A, B])
  })
})

describe('brightness', () => {
  // A is rgb(20, 10, 0).
  it('increases toward white: I + (31 - I) * EVY / 16, rounded down', () => {
    const video = layers([0])
      .io16(REG.BLDCNT, bldcnt(BG0, BLEND_UP, 0))
      .io16(REG.BLDY, 8)
    expect(first(video)).toBe(rgb(25, 20, 15))
  })

  it('decreases toward black: I - I * EVY / 16, the product rounded down', () => {
    const video = layers([0])
      .io16(REG.BLDCNT, bldcnt(BG0, BLEND_DOWN, 0))
      .io16(REG.BLDY, 7)
    // r 20 - 140 / 16 = 20 - 8, g 10 - 70 / 16 = 10 - 4
    expect(first(video)).toBe(rgb(12, 6, 0))
  })

  it('reads EVY above 16 as 16', () => {
    const video = layers([0])
      .io16(REG.BLDCNT, bldcnt(BG0, BLEND_DOWN, 0))
      .io16(REG.BLDY, 31)
    expect(first(video)).toBe(0)
  })

  it('leaves a layer that is no 1st target alone', () => {
    const video = layers([0])
      .io16(REG.BLDCNT, bldcnt(BG1, BLEND_DOWN, 0))
      .io16(REG.BLDY, 16)
    expect(first(video)).toBe(A)
  })
})

describe('a semi-transparent sprite', () => {
  const semi = { x: 0, y: 0, priority: 3, mode: 'semi-transparent' } as const

  it('mixes with a 2nd target behind it under BLDCNT mode 0, without BLDCNT bit 4', () => {
    const video = blend(layers([3], semi), bldcnt(0, 0, BG3), 0, 16)
    expect(first(video)).toBe(B)
    blend(video, bldcnt(0, 0, BG3), 8, 8)
    expect(first(video)).toBe(rgb(17, 15, 19))
  })

  it('shows as is over a layer that is no 2nd target', () => {
    expect(first(blend(layers([3], semi), bldcnt(0, 0, BG2), 0, 16))).toBe(SPRITE)
  })

  it('takes alpha over brightness where it overlaps a 2nd target', () => {
    const video = blend(layers([3], semi), bldcnt(BG3 | LAYER_OBJ, BLEND_DOWN, BG3), 0, 16)
    video.io16(REG.BLDY, 16)
    const drawn = drawFrame(host, video)
    expect([pixel(drawn, 0, 0), pixel(drawn, 8, 0)]).toEqual([B, 0])
  })

  it('gets the brightness effect as a 1st target where nothing behind it is a 2nd target', () => {
    const video = blend(layers([3], semi), bldcnt(0, BLEND_DOWN, BG2), 0, 16).io16(REG.BLDY, 16)
    expect(first(video)).toBe(0)
  })
})
