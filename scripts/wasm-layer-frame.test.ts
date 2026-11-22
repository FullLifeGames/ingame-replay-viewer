// The frame driver of our platform layer (#43, plan B3 and section 2.4), run natively in the host
// harness: the order of lines, drawing, HBlank DMA and the line interrupts within one call.
// GBATEK "LCD I/O Interrupts and Status", "LCD Dimensions and Timings", "GBA DMA Transfers",
// "BIOS Halt Functions" and "LCD I/O Display Control".
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import {
  asHalves,
  dmaSet,
  frame,
  FRAME_BYTES,
  halves,
  load,
  onIrq,
  read,
  runScript,
} from './wasm-layer-script.ts'
import {
  bgCnt,
  bgControl,
  bgHofs,
  DISPCNT_FORCED_BLANK,
  DISPSTAT_HBLANK_IRQ,
  DISPSTAT_VBLANK_IRQ,
  DISPSTAT_VCOUNT_IRQ,
  dispcntBg,
  drawFrame,
  INTR_HBLANK,
  INTR_VBLANK,
  INTR_VCOUNT,
  IO,
  PRAM,
  pixel,
  REG,
  rgb,
  row,
  solid4,
  videoOps,
  Video,
  WHITE,
} from './wasm-layer-video.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-frame-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const BACKDROP = rgb(1, 2, 3)
const OTHER = rgb(20, 0, 0)
const RED = rgb(31, 0, 0)
const EWRAM = 0x02000000

/** The backdrop only, with the line interrupts of `dispstat` enabled in DISPSTAT and IE. */
function lines(dispstat: number, lyc = 0): Video {
  const ie =
    (dispstat & DISPSTAT_VBLANK_IRQ ? INTR_VBLANK : 0) |
    (dispstat & DISPSTAT_HBLANK_IRQ ? INTR_HBLANK : 0) |
    (dispstat & DISPSTAT_VCOUNT_IRQ ? INTR_VCOUNT : 0)
  return new Video()
    .bgColor(0, BACKDROP)
    .io16(REG.DISPSTAT, dispstat | (lyc << 8))
    .io16(REG.IE, ie)
}

/** The first line of the frame whose backdrop is not BACKDROP. */
const firstChanged = (drawn: ReturnType<typeof drawFrame>) =>
  Array.from({ length: 160 }, (_, y) => pixel(drawn, 0, y)).findIndex((c) => c !== BACKDROP)

describe('one call of the frame driver', () => {
  it('raises VCount at LYC 150 after line 149 is drawn and before line 150', () => {
    const video = lines(DISPSTAT_VCOUNT_IRQ, 150)
    video.ops.push(onIrq(INTR_VCOUNT, PRAM, OTHER))
    const drawn = drawFrame(host, video, 4)
    expect(firstChanged(drawn)).toBe(150)
    expect(drawn.irqs).toEqual([{ flag: INTR_VCOUNT, vcount: 150 }])
  })

  it('moves only lines 80-159 when the VCount handler of line 80 writes HOFS', () => {
    const video = lines(DISPSTAT_VCOUNT_IRQ, 80)
      .io16(REG.DISPCNT, dispcntBg(0))
      .io16(bgCnt(0), bgControl({ screenBase: 31 }))
      .bgColor(1, RED)
      .bgTile(0, 1, solid4(1))
    for (let y = 0; y < 20; y++) video.bgMap(31, 0, y, { tile: 1 })
    video.ops.push(onIrq(INTR_VCOUNT, IO + bgHofs(0), 4))
    const drawn = drawFrame(host, video)
    expect(pixel(drawn, 4, 79)).toBe(RED)
    expect(pixel(drawn, 4, 80)).toBe(BACKDROP)
    expect(pixel(drawn, 3, 159)).toBe(RED)
  })

  it('runs HBlank DMA after each of lines 0-159 and never in lines 160-227', () => {
    const colours = Array.from({ length: 228 }, (_, i) => i + 1)
    const control = (0x8000 | 0x2000 | 0x0200 | 0x0060) * 0x10000 + 1
    const video = lines(0)
    video.ops.push(load(EWRAM, halves(colours)), dmaSet(0, EWRAM, PRAM, control))
    const { dest } = runScript(host, [...videoOps(video), frame, read(PRAM, 2)], FRAME_BYTES + 2)
    const pixels = new Uint16Array(dest.slice(0, FRAME_BYTES).buffer)
    const backdrops = Array.from({ length: 160 }, (_, y) => pixels[y * 240])
    expect(backdrops).toEqual([BACKDROP, ...colours.slice(0, 159)])
    expect(asHalves(dest.slice(FRAME_BYTES))).toEqual([160])
  })

  it('raises HBlank once in each of the 228 lines and VBlank once at line 160', () => {
    const drawn = drawFrame(host, lines(DISPSTAT_HBLANK_IRQ | DISPSTAT_VBLANK_IRQ), 230)
    expect(drawn.calls).toBe(229)
    const hblanks = drawn.irqs.filter((irq) => irq.flag === INTR_HBLANK).map((irq) => irq.vcount)
    expect(hblanks).toEqual([
      ...Array.from({ length: 67 }, (_, i) => 161 + i),
      ...Array.from({ length: 161 }, (_, i) => i),
    ])
    const vblank = drawn.irqs.findIndex((irq) => irq.flag === INTR_VBLANK)
    expect(drawn.irqs[vblank]).toEqual({ flag: INTR_VBLANK, vcount: 160 })
    expect(drawn.irqs[vblank + 1]).toEqual({ flag: INTR_HBLANK, vcount: 160 })
  })

  it('raises nothing without the DISPSTAT enables, and sets IME as IntrWait does', () => {
    const quiet = lines(0).io16(REG.IE, 0x3fff)
    expect(drawFrame(host, quiet).calls).toBe(0)
    const imeOff = lines(DISPSTAT_VBLANK_IRQ).io16(REG.IME, 0)
    expect(drawFrame(host, imeOff).calls).toBe(1)
  })

  it('returns in line 161 with the VBlank flag set and the HBlank flag clear', () => {
    const video = lines(0)
    const { dest } = runScript(
      host,
      [...videoOps(video), frame, read(IO + REG.DISPSTAT, 4)],
      FRAME_BYTES + 4,
    )
    const [dispstat, vcount] = asHalves(dest.slice(FRAME_BYTES))
    expect([(dispstat ?? 0) & 3, vcount]).toEqual([1, 161])
  })
})

describe('the picture', () => {
  it('fills every line with the backdrop when nothing is drawn', () => {
    const drawn = drawFrame(host, lines(0))
    expect(new Set(row(drawn, 0)).size).toBe(1)
    expect(pixel(drawn, 239, 159)).toBe(BACKDROP)
  })

  it('draws white lines in forced blank, until a write clears it', () => {
    const video = lines(DISPSTAT_VCOUNT_IRQ, 100).io16(REG.DISPCNT, DISPCNT_FORCED_BLANK)
    video.ops.push(onIrq(INTR_VCOUNT, IO + REG.DISPCNT, 0))
    const drawn = drawFrame(host, video)
    expect([pixel(drawn, 0, 99), pixel(drawn, 0, 100)]).toEqual([WHITE, BACKDROP])
  })
})
