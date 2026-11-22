// The host harness's trace of a frame (#43, plan B4): per pixel the top two layers' colours, the
// effect and its coefficients, which the mGBA oracle reads to redo mGBA's own arithmetic.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import { FRAME_WIDTH, traceAt } from './wasm-layer-script.ts'
import {
  BLEND_ALPHA,
  BLEND_DOWN,
  bgCnt,
  bgControl,
  bldcnt,
  DISPCNT_FORCED_BLANK,
  DISPCNT_WIN0,
  dispcntBg,
  REG,
  rgb,
  solid4,
  traceVideo,
  Video,
  WHITE,
  windowH,
  windowV,
} from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-trace-'))
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

/** BG0 (priority 0) A and BG1 (priority 1) B over the whole screen. */
function twoBgs(): Video {
  return new Video()
    .io16(REG.DISPCNT, dispcntBg(0) | dispcntBg(1))
    .io16(bgCnt(0), bgControl({ screenBase: 30 }))
    .io16(bgCnt(1), bgControl({ priority: 1, screenBase: 31 }))
    .bgColor(0, BACKDROP)
    .bgColor(1, A)
    .bgColor(2, B)
    .bgTile(0, 1, solid4(1))
    .bgTile(0, 2, solid4(2))
    .bgFill(30, { tile: 1 })
    .bgFill(31, { tile: 2 })
}

const at = (trace: Uint8Array, x: number, y: number) => traceAt(trace, y * FRAME_WIDTH + x)

describe('the trace of a frame', () => {
  it('holds the top two colours, the alpha effect and EVA and EVB of a blended pixel', () => {
    const video = twoBgs()
      .io16(REG.BLDCNT, bldcnt(1, BLEND_ALPHA, 2))
      .io16(REG.BLDALPHA, 0x0907)
    const { trace } = traceVideo(host, video)
    expect(at(trace, 5, 7)).toEqual({ top: A, below: B, effect: 1, eva: 7, evb: 9, evy: 0 })
  })

  it('holds no effect where the window cuts it, and EVY for a darkened pixel', () => {
    const video = twoBgs()
      .io16(REG.DISPCNT, DISPCNT_WIN0 | dispcntBg(0) | dispcntBg(1))
      .io16(REG.WIN0H, windowH(0, 1))
      .io16(REG.WIN0V, windowV(0, 160))
      .io16(REG.WININ, 3)
      .io16(REG.WINOUT, 0x23)
      .io16(REG.BLDCNT, bldcnt(1, BLEND_DOWN, 0))
      .io16(REG.BLDY, 20)
    const { trace } = traceVideo(host, video)
    expect(at(trace, 0, 0).effect).toBe(0)
    expect(at(trace, 1, 0)).toEqual({ top: A, below: B, effect: 3, eva: 0, evb: 0, evy: 16 })
  })

  it('holds the backdrop and nothing below it where no layer shows', () => {
    const video = twoBgs().io16(REG.DISPCNT, 0)
    expect(at(traceVideo(host, video).trace, 9, 9)).toMatchObject({ top: BACKDROP, below: 0 })
  })

  it('holds white on a forced blank line', () => {
    const video = twoBgs().io16(REG.DISPCNT, DISPCNT_FORCED_BLANK)
    expect(at(traceVideo(host, video).trace, 9, 9)).toMatchObject({ top: WHITE, effect: 0 })
  })
})
