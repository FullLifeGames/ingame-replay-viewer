import { describe, expect, it } from 'vitest'

import {
  checkShots,
  differingPixels,
  filledBarPixels,
  isBlank,
  readPpm,
  textPixels,
} from './rom-shot-probes.ts'
import type { Frame, HpBar, Region } from './rom-shot-probes.ts'

const WIDTH = 24
const HEIGHT = 16

function frameOf(colour: number): Frame {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3)
  const frame = { width: WIDTH, height: HEIGHT, rgb }
  paint(frame, { x: 0, y: 0, width: WIDTH, height: HEIGHT }, colour)
  return frame
}

function paint(frame: Frame, region: Region, colour: number): Frame {
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const at = (y * frame.width + x) * 3
      frame.rgb.set([colour >> 16, (colour >> 8) & 0xff, colour & 0xff], at)
    }
  }
  return frame
}

const ppm = (header: string, body: number[]) =>
  Uint8Array.from([...new TextEncoder().encode(header), ...body])

describe('reading a frame of the shot tool (S4)', () => {
  it('reads a binary PPM: size and red, green, blue per pixel', () => {
    const frame = readPpm(ppm('P6\n2 1\n255\n', [1, 2, 3, 250, 251, 252]))
    expect(frame).toEqual({ width: 2, height: 1, rgb: Uint8Array.of(1, 2, 3, 250, 251, 252) })
  })

  it('refuses another kind of file', () => {
    expect(() => readPpm(ppm('P3\n2 1\n255\n', [0]))).toThrow('no binary PPM of 8-bit RGB')
  })

  it('refuses a frame whose pixels are cut short', () => {
    expect(() => readPpm(ppm('P6\n2 1\n255\n', [1, 2, 3, 4]))).toThrow(
      'the PPM has 4 bytes of pixels, 2x1 needs 6',
    )
  })
})

const BAR: HpBar = { x: 0, y: 4, width: 20, empty: [0x506858] }
const GREEN = 0x70f8a8
const EMPTY = 0x506858

describe('the probes on synthetic frames (S5)', () => {
  it('counts the pixels in which two frames differ', () => {
    const before = frameOf(0x000000)
    const after = paint(frameOf(0x000000), { x: 3, y: 2, width: 4, height: 2 }, 0xffffff)
    expect(differingPixels(before, before)).toBe(0)
    expect(differingPixels(before, after)).toBe(8)
    expect(differingPixels(before, after, { x: 10, y: 0, width: 4, height: 4 })).toBe(0)
  })

  it('counts the filled pixels of an HP bar: half of a bar of 20 is 10', () => {
    const frame = paint(frameOf(0xffffff), { x: 0, y: 4, width: 20, height: 1 }, EMPTY)
    expect(filledBarPixels(frame, BAR)).toBe(0)
    paint(frame, { x: 0, y: 4, width: 10, height: 1 }, GREEN)
    expect(filledBarPixels(frame, BAR)).toBe(10)
  })

  it('tells a blank digit area from one with digits', () => {
    const area = { x: 4, y: 4, width: 8, height: 4 }
    const frame = paint(frameOf(0x000000), area, 0xf8f8e0)
    expect(isBlank(frame, area)).toBe(true)
    paint(frame, { x: 6, y: 5, width: 1, height: 2 }, 0x404040)
    expect(isBlank(frame, area)).toBe(false)
  })

  it('counts the text pixels of a window: those unlike its most common colour', () => {
    const window = { x: 0, y: 8, width: 24, height: 8 }
    const frame = paint(frameOf(0x000000), window, 0xffffff)
    expect(textPixels(frame, window)).toBe(0)
    paint(frame, { x: 2, y: 10, width: 5, height: 3 }, 0x303030)
    expect(textPixels(frame, window)).toBe(15)
  })
})

describe('checking the shots of a scene', () => {
  const black = frameOf(0x000000)
  const changed = paint(frameOf(0x000000), { x: 0, y: 0, width: 2, height: 2 }, 0xffffff)
  const frames = new Map([
    ['before', black],
    ['after', changed],
  ])

  it('passes a scene whose frames show what it expects', () => {
    expect(checkShots({ probe: 'differs', before: 'before', after: 'after' }, frames)).toEqual({
      pass: true,
      detail: '4 pixels differ',
    })
  })

  it('takes two frames that agree in a region and counts the pixels where they do not', () => {
    const region = { x: 0, y: 0, width: 4, height: 4 }
    expect(
      checkShots({ probe: 'same', before: 'before', after: 'before', region }, frames),
    ).toEqual({
      pass: true,
      detail: '0 pixels differ',
    })
    expect(checkShots({ probe: 'same', before: 'before', after: 'after', region }, frames)).toEqual(
      {
        pass: false,
        detail: '4 pixels differ',
      },
    )
  })

  it('fails a change from a frame of one colour when the scene needs that frame drawn', () => {
    const check = { probe: 'differs', before: 'before', after: 'after', beforeDrawn: true } as const
    expect(checkShots(check, frames)).toEqual({
      pass: false,
      detail: '4 pixels differ, but the frame before is one colour',
    })
    const drawn = new Map([
      ['before', changed],
      ['after', black],
    ])
    expect(checkShots(check, drawn)).toEqual({ pass: true, detail: '4 pixels differ' })
  })

  it('fails a scene whose frames show nothing new', () => {
    expect(checkShots({ probe: 'differs', before: 'before', after: 'before' }, frames)).toEqual({
      pass: false,
      detail: '0 pixels differ',
    })
  })

  it('takes a bar filled to the pixel and fails one pixel off', () => {
    const bar = paint(
      paint(frameOf(0), { ...BAR, height: 1 }, EMPTY),
      { x: 0, y: 4, width: 11, height: 1 },
      GREEN,
    )
    const shots = new Map([['hp', bar]])
    const check = (filled: number) =>
      checkShots({ probe: 'bar', shot: 'hp', bar: BAR, filled }, shots)
    expect(check(11)).toEqual({ pass: true, detail: '11 of 20 pixels filled, 11 expected' })
    expect(check(10)).toEqual({ pass: false, detail: '11 of 20 pixels filled, 10 expected' })
    expect(check(12).pass).toBe(false)
  })

  it('takes a blank screen of the expected colour and names another colour', () => {
    const screen = { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    const shots = new Map([
      ['red', frameOf(0x630000)],
      ['white', frameOf(0xffffff)],
    ])
    const check = (shot: string) =>
      checkShots({ probe: 'blank', shot, region: screen, colour: 0x630000 }, shots)
    expect(check('red')).toEqual({ pass: true, detail: 'one colour, 0x630000' })
    expect(check('white')).toEqual({ pass: false, detail: 'one colour, 0xffffff, not 0x630000' })
  })

  it('fails a scene whose shot the tool never took', () => {
    const region = { x: 0, y: 0, width: 2, height: 2 }
    expect(checkShots({ probe: 'text', shot: 'win', region }, frames)).toEqual({
      pass: false,
      detail: 'no frame "win": the replay never reached it',
    })
  })
})
