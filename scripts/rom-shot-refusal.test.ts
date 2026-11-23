// The shot tools' side of #30: the refusal screen names its reason in text on the refusal colour,
// and B held after END must leave the replay's last scene as it is.
import { describe, expect, it } from 'vitest'

import { checkShots, SCREEN } from './rom-shot-probes.ts'
import type { Frame, Region } from './rom-shot-probes.ts'
import { refusalScenes, scenesOf } from './rom-shot-scenes.ts'
import { handMadeStream } from './rom-shot-stream.ts'
import { withHeldB } from './rom-shot.ts'
import type { StreamPlan } from './rom-shot.ts'

const WIDTH = 24
const HEIGHT = 16
const RED = 0x630000
const WHOLE = { x: 0, y: 0, width: WIDTH, height: HEIGHT }

function frameOf(colour: number): Frame {
  return paint(
    { width: WIDTH, height: HEIGHT, rgb: new Uint8Array(WIDTH * HEIGHT * 3) },
    WHOLE,
    colour,
  )
}

function paint(frame: Frame, region: Region, colour: number): Frame {
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const at = (y * frame.width + x) * 3
      frame.rgb.set([(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff], at)
    }
  }
  return frame
}

describe('the text probe on a background colour', () => {
  const text = { probe: 'text', shot: 'final', region: WHOLE, background: RED } as const
  const check = (frame: Frame) => checkShots(text, new Map([['final', frame]]))

  it('passes text of 20 pixels or more on the background', () => {
    const frame = paint(frameOf(RED), { x: 2, y: 4, width: 10, height: 2 }, 0xffffff)
    expect(check(frame)).toEqual({ pass: true, detail: '20 text pixels on 0x630000' })
  })

  it('fails the background alone', () => {
    expect(check(frameOf(RED))).toEqual({ pass: false, detail: '0 text pixels on 0x630000' })
  })

  it('fails text on another colour, however much of it there is', () => {
    const frame = paint(frameOf(0x000000), { x: 0, y: 0, width: 12, height: 4 }, 0xffffff)
    expect(check(frame)).toEqual({
      pass: false,
      detail: 'the most common colour is 0x000000, not 0x630000',
    })
  })
})

describe('the scene of a refused stream', () => {
  it('asks for text on the refusal colour over the whole last frame', () => {
    expect(refusalScenes(RED)).toEqual([
      {
        name: 'refused',
        shots: [],
        check: { probe: 'text', shot: 'final', region: SCREEN.screen, background: RED },
      },
    ])
  })
})

describe('the run with B held after END', () => {
  const handMade = handMadeStream()
  const play = (name: string, outcome = 'finished'): StreamPlan => ({
    name,
    stream: new Uint8Array([name.length]),
    scenes: name === 'hand-made' ? scenesOf(handMade) : [],
    missing: [],
    expect: outcome,
  })
  const refusals = [play('empty-slot', 'EMPTY'), play('version-3', 'VERSION')]

  it("follows hand-made with B held from the frame after END and hand-made's scenes", () => {
    const plans = [play('hand-made'), play('994052'), ...refusals]
    const runs = withHeldB(plans)
    expect(runs.map((run) => run.name)).toEqual([
      'hand-made',
      'hand-made-b',
      '994052',
      'empty-slot',
      'version-3',
    ])
    const [handMadeRun, heldB] = runs
    expect(heldB).toEqual({ ...handMadeRun, name: 'hand-made-b', holdBFromEnd: 1 })
    expect(heldB?.scenes.map((scene) => scene.name)).toContain('outro')
    expect(runs.filter((run) => run.holdBFromEnd !== undefined)).toHaveLength(1)
  })

  it('adds no run when hand-made is not named', () => {
    const plans = [play('994052'), ...refusals]
    expect(withHeldB(plans)).toEqual(plans)
  })
})
