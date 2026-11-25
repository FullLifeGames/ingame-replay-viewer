// The far trainer of the outro (#71): 150 frames after END a far winner's trainer stands where its
// slide ends, 32 pixels right of where the intro drew it. These frames are drawn here: a field
// whose colour changes with x, so that the field behind the trainer differs between the two
// places, and a trainer with clear pixels through which the field shows.
import { describe, expect, it } from 'vitest'

import type { Instruction } from '../src/gen3/stream/instructions.ts'
import { streamOf } from '../src/gen3/stream/testing.ts'

import { checkShots } from './rom-shot-probes.ts'
import type { Frame } from './rom-shot-probes.ts'
import { scenesOf } from './rom-shot-scenes.ts'

const WIDTH = 240
const HEIGHT = 160
const SIZE = 64
const TOP = 8
const INTRO_X = 144
const END_X = 176

const fieldColour = (x: number, y: number) => 0x204000 + ((x * 37 + y * 11) % 97)
// A clear pixel on every fifth step of the pattern, as a sprite's transparent colour.
const trainerColour = (u: number, v: number) =>
  (u * 7 + v * 3) % 5 === 0 ? undefined : 0x800000 + ((u * 13 + v * 29) % 101) * 0x100

function setColour(frame: Frame, x: number, y: number, colour: number) {
  frame.rgb.set([(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff], (y * WIDTH + x) * 3)
}

function field(): Frame {
  const frame = { width: WIDTH, height: HEIGHT, rgb: new Uint8Array(WIDTH * HEIGHT * 3) }
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) setColour(frame, x, y, fieldColour(x, y))
  }
  return frame
}

// The trainer's sprite with its left edge at x, cut at the screen's right edge.
function withTrainer(frame: Frame, left: number): Frame {
  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE && left + u < WIDTH; u++) {
      const colour = trainerColour(u, v)
      if (colour !== undefined) setColour(frame, left + u, TOP + v, colour)
    }
  }
  return frame
}

const farWon: Instruction[] = [
  { op: 'intro' },
  { op: 'print', text: 'Bob won!' },
  { op: 'end', outcome: 'farWon' },
]

function outroCheck() {
  const scene = scenesOf(streamOf(farWon)).find(({ name }) => name === 'outro')
  if (scene === undefined) throw new Error('no outro scene')
  return scene.check
}

// The win frame shows the far mon where the outro's trainer stands; the outro frame keeps the text
// box of the win frame, as the hold does.
const framesWithOutro = (outro: Frame) =>
  new Map([
    ['intro', withTrainer(field(), INTRO_X)],
    ['win', withTrainer(field(), END_X - 20)],
    ['outro', outro],
  ])

describe("the outro's far trainer after a far win", () => {
  it('passes the trainer at the end of its slide', () => {
    const verdict = checkShots(outroCheck(), framesWithOutro(withTrainer(field(), END_X)))
    expect(verdict.pass).toBe(true)
  })

  it.each([
    ['a step of the slide before its end', END_X + 2],
    ['still on its way in', END_X + 30],
    ['left of the end', END_X - 6],
    ['where the intro drew it', INTRO_X],
  ])('fails the trainer %s', (_, left) => {
    const verdict = checkShots(outroCheck(), framesWithOutro(withTrainer(field(), left)))
    expect(verdict.pass).toBe(false)
  })

  it('fails the field with no trainer on it', () => {
    expect(checkShots(outroCheck(), framesWithOutro(field())).pass).toBe(false)
  })

  it('fails a black frame', () => {
    const black = { width: WIDTH, height: HEIGHT, rgb: new Uint8Array(WIDTH * HEIGHT * 3) }
    expect(checkShots(outroCheck(), framesWithOutro(black)).pass).toBe(false)
  })
})
