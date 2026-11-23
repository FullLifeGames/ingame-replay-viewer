import { describe, expect, it } from 'vitest'

import { streamOf } from '../src/gen3/stream/testing.ts'

import {
  checkShots,
  differingPixels,
  filledBarPixels,
  isBlank,
  readPpm,
  textPixels,
  SCREEN,
} from './rom-shot-probes.ts'
import type { Frame, HpBar, Region } from './rom-shot-probes.ts'
import { scenesOf } from './rom-shot-scenes.ts'

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

  describe('a change that must keep a region as the frame before shows it (the outro)', () => {
    const trainer = { x: 0, y: 0, width: 8, height: 8 }
    const textBox = { x: 0, y: 8, width: 24, height: 8 }
    const withText = () => {
      const frame = paint(frameOf(0x506070), textBox, 0xf8f8f8)
      return paint(frame, { x: 2, y: 10, width: 5, height: 3 }, 0x484848)
    }
    const win = withText()
    const slidIn = paint(withText(), { x: 1, y: 1, width: 6, height: 6 }, 0xc08040)
    // A palette fade to black on its way: every colour at half its brightness.
    const halfFaded = { ...slidIn, rgb: slidIn.rgb.map((channel) => channel >> 1) }
    const check = {
      probe: 'differs',
      before: 'win',
      after: 'outro',
      region: trainer,
      kept: textBox,
    } as const
    const verdict = (outro: Frame) =>
      checkShots(
        check,
        new Map([
          ['win', win],
          ['outro', outro],
        ]),
      )

    it('passes the frame with the trainer slid in and the text box as it was', () => {
      expect(verdict(slidIn)).toEqual({ pass: true, detail: '36 pixels differ' })
    })

    it('fails a black frame, which differs in the trainer region too', () => {
      expect(verdict(frameOf(0x000000))).toEqual({
        pass: false,
        detail: '64 pixels differ, but 192 pixels of the kept region differ too',
      })
    })

    it('fails a frame on its way to black', () => {
      expect(verdict(halfFaded)).toEqual({
        pass: false,
        detail: '64 pixels differ, but 192 pixels of the kept region differ too',
      })
    })
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

  describe('the ball display', () => {
    const BALL = 0xf79473
    const EMPTY_CIRCLE = 0x4a425a
    const cells = [0, 4, 8, 12, 16, 20].map((x) => ({ x, y: 2, width: 3, height: 3 }))
    function display(balls: readonly number[]) {
      const frame = frameOf(0xf7f7ff)
      for (const [i, cell] of cells.entries()) {
        paint(frame, cell, EMPTY_CIRCLE)
        if (balls.includes(i)) paint(frame, { ...cell, width: 2 }, BALL)
      }
      return new Map([['balls', frame]])
    }
    const check = (balls: number) =>
      ({ probe: 'balls', shot: 'balls', cells, colour: BALL, balls }) as const

    it('passes when the first cells show the same ball and the others do not', () => {
      expect(checkShots(check(3), display([0, 1, 2]))).toEqual({
        pass: true,
        detail: '3 balls, 3 expected',
      })
      expect(checkShots(check(6), display([0, 1, 2, 3, 4, 5])).pass).toBe(true)
    })

    it('counts a single ball in the singular', () => {
      expect(checkShots(check(1), display([0]))).toEqual({
        pass: true,
        detail: '1 ball, 1 expected',
      })
    })

    it('fails a missing ball and an extra ball, with the count', () => {
      expect(checkShots(check(6), display([0, 1, 2, 3, 4]))).toEqual({
        pass: false,
        detail: '5 balls, 6 expected',
      })
      expect(checkShots(check(2), display([0, 1, 2]))).toEqual({
        pass: false,
        detail: '3 balls, 2 expected',
      })
    })

    it('fails a ball after an empty slot', () => {
      expect(checkShots(check(3), display([0, 1, 3]))).toEqual({
        pass: false,
        detail: '3 balls, 3 expected, with a gap at cell 2',
      })
    })

    it('fails a display that is not drawn, though its cells are all alike', () => {
      const blank = new Map([['balls', frameOf(0xf7f7ff)]])
      expect(checkShots(check(6), blank)).toEqual({
        pass: false,
        detail: 'no ball in the first cell: no 0xf79473',
      })
    })
  })

  it('fails a scene whose shot the tool never took', () => {
    const region = { x: 0, y: 0, width: 2, height: 2 }
    expect(checkShots({ probe: 'text', shot: 'win', region }, frames)).toEqual({
      pass: false,
      detail: 'no frame "win": the replay never reached it',
    })
  })
})

describe("the outro scene's check on frames of a near win", () => {
  const [outro] = scenesOf(
    streamOf([
      { op: 'intro' },
      { op: 'print', text: 'Alice won!' },
      { op: 'end', outcome: 'nearWon' },
    ]),
  ).filter(({ name }) => name === 'outro')
  // The field in green, the win line in the text box, and a sprite where the near trainer stands.
  const screen = (sprite?: number) => {
    const rgb = new Uint8Array(240 * 160 * 3)
    const frame = paint({ width: 240, height: 160, rgb }, SCREEN.screen, 0x40a040)
    paint(frame, { ...SCREEN.message, width: 40 }, 0xf8f8f8)
    return sprite === undefined
      ? frame
      : paint(frame, { x: 64, y: 56, width: 32, height: 48 }, sprite)
  }
  const TRAINER = 0xd06030
  const check = (after: Frame) =>
    checkShots(
      outro?.check ?? { probe: 'blank', shot: 'none', region: SCREEN.screen },
      new Map([
        ['intro', screen(TRAINER)],
        ['win', screen(0x3060d0)],
        ['outro', after],
      ]),
    ).pass

  it('passes a frame that shows the trainer as the intro drew it', () => {
    expect(check(screen(TRAINER))).toBe(true)
  })

  it('fails a frame where the mon went back and no trainer came in', () => {
    expect(check(screen())).toBe(false)
  })

  it('fails a frame on its way to black', () => {
    const frame = screen(TRAINER)
    expect(check({ ...frame, rgb: frame.rgb.map((channel) => channel >> 1) })).toBe(false)
  })
})
