import { describe, expect, it } from 'vitest'

import type { Instruction } from '../src/gen3/stream/instructions.ts'
import { DUGTRIO, streamOf } from '../src/gen3/stream/testing.ts'

import { SCREEN } from './rom-shot-probes.ts'
import { refusalScenes, scenesOf, shotArgs } from './rom-shot-scenes.ts'
import { handMadeStream } from './rom-shot-stream.ts'

const scenesFor = (instructions: readonly Instruction[]) => scenesOf(streamOf(instructions))
const named = (instructions: readonly Instruction[], name: string) =>
  scenesFor(instructions).find((scene) => scene.name === name)

describe('the scene points of a decoded instruction list (S6)', () => {
  it('finds every scene of the hand-made stream, in the order of the plan', () => {
    expect(scenesOf(handMadeStream()).map((scene) => scene.name)).toEqual([
      'intro',
      'send-outs',
      'first-move',
      'first-hp',
      'first-status',
      'first-switch',
      'first-faint',
      'win',
    ])
  })

  it('shoots the intro on the frames before and after the INTRO op', () => {
    const scene = named(
      [{ op: 'turn', number: 1 }, { op: 'intro' }, { op: 'end', outcome: 'tie' }],
      'intro',
    )
    expect(scene?.shots).toEqual([
      { name: 'intro-before', done: 1, frames: 0 },
      { name: 'intro', done: 2, frames: 0 },
    ])
    expect(scene?.check).toEqual({ probe: 'differs', before: 'intro-before', after: 'intro' })
  })

  it('checks the near HP digits after the second SEND_OUT', () => {
    const scene = named(
      [
        { op: 'intro' },
        { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
        { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
        { op: 'end', outcome: 'tie' },
      ],
      'send-outs',
    )
    expect(scene?.shots).toEqual([{ name: 'send-outs', done: 3, frames: 0 }])
    expect(scene?.check).toEqual({ probe: 'blank', shot: 'send-outs', region: SCREEN.nearHpDigits })
  })

  it('shoots the first move 20 frames into its animation', () => {
    const scene = named(
      [
        { op: 'print', text: 'Go!' },
        { op: 'move', user: 'near', target: 'far', move: 89 },
        { op: 'end', outcome: 'tie' },
      ],
      'first-move',
    )
    expect(scene?.shots).toEqual([
      { name: 'first-move-before', done: 1, frames: 0 },
      { name: 'first-move', done: 1, frames: 20 },
    ])
  })

  it('expects the far HP bar filled as the logged HP over the max HP of the mon on the field', () => {
    const scene = named(
      [
        { op: 'sendOut', side: 'far', slot: 1, hp: 100, status: 'none' },
        { op: 'hp', side: 'near', hp: 10 },
        { op: 'hp', side: 'far', hp: 71 },
        { op: 'end', outcome: 'tie' },
      ],
      'first-hp',
    )
    expect(scene?.shots).toEqual([{ name: 'first-hp', done: 3, frames: 0 }])
    expect(scene?.check).toEqual({
      probe: 'bar',
      shot: 'first-hp',
      bar: SCREEN.farHpBar,
      filled: 34,
    })
  })

  it.each([
    [99, 47],
    [50, 24],
    [3, 1],
    [1, 1],
  ])('fills the bar as the engine does: %i of 100 HP is %i pixels', (hp, filled) => {
    const scene = named(
      [
        { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
        { op: 'hp', side: 'far', hp },
        { op: 'end', outcome: 'tie' },
      ],
      'first-hp',
    )
    expect(scene?.check).toMatchObject({ filled })
  })

  it('takes the first far HP change that leaves the bar partly filled, past a knock-out', () => {
    const scene = named(
      [
        { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
        { op: 'hp', side: 'far', hp: 0 },
        { op: 'switchIn', side: 'far', slot: 1, hp: 100, status: 'none' },
        { op: 'hp', side: 'far', hp: 100 },
        { op: 'hp', side: 'far', hp: 50 },
        { op: 'end', outcome: 'tie' },
      ],
      'first-hp',
    )
    expect(scene?.shots).toEqual([{ name: 'first-hp', done: 5, frames: 0 }])
    expect(scene?.check).toMatchObject({ filled: 24 })
  })

  it('falls back to the first far HP change when none leaves the bar partly filled', () => {
    const scene = named(
      [
        { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
        { op: 'hp', side: 'far', hp: 0 },
        { op: 'end', outcome: 'tie' },
      ],
      'first-hp',
    )
    expect(scene?.shots).toEqual([{ name: 'first-hp', done: 2, frames: 0 }])
    expect(scene?.check).toMatchObject({ filled: 0 })
  })

  it('follows a switch to the mon whose max HP the bar shows', () => {
    const stream = streamOf([
      { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
      { op: 'switchIn', side: 'far', slot: 2, hp: 200, status: 'none' },
      { op: 'hp', side: 'far', hp: 100 },
      { op: 'end', outcome: 'tie' },
    ])
    const big = { ...DUGTRIO, maxHp: 200 }
    const far = stream.parties.far.map((mon, slot) => (slot === 2 ? big : mon))
    const scene = scenesOf({ ...stream, parties: { ...stream.parties, far } }).find(
      (found) => found.name === 'first-hp',
    )
    expect(scene?.check).toMatchObject({ filled: 24 })
  })

  it('takes the first status of a mon on the field and looks at its healthbox', () => {
    const scene = named(
      [
        { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
        { op: 'status', side: 'far', slot: 3, status: 'par' },
        { op: 'status', side: 'far', slot: 0, status: 'brn' },
        { op: 'end', outcome: 'tie' },
      ],
      'first-status',
    )
    expect(scene?.shots.map((shot) => shot.done)).toEqual([2, 3])
    expect(scene?.check).toMatchObject({ probe: 'differs', region: SCREEN.healthbox.far })
  })

  it('shoots the first switch and the first faint on the frames around their ops', () => {
    const instructions: Instruction[] = [
      { op: 'faint', side: 'far' },
      { op: 'switchIn', side: 'far', slot: 2, hp: 100, status: 'none' },
      { op: 'end', outcome: 'tie' },
    ]
    expect(named(instructions, 'first-faint')?.shots.map((shot) => shot.done)).toEqual([0, 1])
    expect(named(instructions, 'first-switch')?.shots.map((shot) => shot.done)).toEqual([1, 2])
  })

  it('checks the text box after the last PRINT', () => {
    const scene = named(
      [
        { op: 'print', text: 'One' },
        { op: 'print', text: 'Alice won the battle!' },
        { op: 'end', outcome: 'nearWon' },
      ],
      'win',
    )
    expect(scene?.shots).toEqual([{ name: 'win', done: 2, frames: 0 }])
    expect(scene?.check).toEqual({ probe: 'text', shot: 'win', region: SCREEN.message })
  })

  it('leaves out the scenes a stream lacks', () => {
    expect(scenesFor([{ op: 'end', outcome: 'tie' }])).toEqual([])
    expect(
      named(
        [
          { op: 'hp', side: 'far', hp: 50 },
          { op: 'end', outcome: 'tie' },
        ],
        'first-hp',
      ),
    ).toBeUndefined()
  })

  it('gives the shot tool one argument per shot', () => {
    expect(shotArgs(scenesFor([{ op: 'intro' }, { op: 'end', outcome: 'tie' }]))).toEqual([
      'intro-before:0:0',
      'intro:1:0',
    ])
  })

  it('checks a refused stream on the last frame: the whole screen in the refusal colour', () => {
    expect(refusalScenes()).toEqual([
      {
        name: 'refused',
        shots: [],
        check: { probe: 'blank', shot: 'final', region: SCREEN.screen, colour: 0x630000 },
      },
    ])
  })
})
