import { describe, expect, it } from 'vitest'

import {
  BUTTON,
  buttonChanges,
  type FrameInput,
  type MacroStep,
  macroPlayer,
  routeSlice,
} from './macro'
import type { ReadRam } from './ram-check'
import type { MemoryWrite } from './ram-write'

const nothing: ReadRam = () => 0

/** Plays `frames` frames and gives each frame's buttons joined, '-' for none. */
function play(steps: MacroStep[], frames: number, read: ReadRam = nothing): FrameInput[] {
  const player = macroPlayer(steps)
  return Array.from({ length: frames }, () => player.next(read))
}
const shown = (inputs: FrameInput[]) =>
  inputs.map((input) => (input.buttons.length === 0 ? '-' : input.buttons.join('+')))

describe('macroPlayer', () => {
  it('expands press A for 2 frames, wait 30, press A into per-frame inputs', () => {
    const steps: MacroStep[] = [
      { kind: 'press', buttons: ['A'], frames: 2 },
      { kind: 'wait', frames: 30 },
      { kind: 'press', buttons: ['A'], frames: 1 },
    ]
    const inputs = play(steps, 34)
    expect(shown(inputs)).toEqual(['A', 'A', ...Array<string>(30).fill('-'), 'A', '-'])
    expect(inputs[32]?.done).toBe(false)
    expect(inputs[33]).toEqual({ buttons: [], marks: [], step: 3, done: true })
  })

  it('mashes a button for `hold` frames out of every `every`, and holds two buttons at once', () => {
    const steps: MacroStep[] = [
      { kind: 'mash', frames: 8, mash: { buttons: ['A'], every: 4, hold: 2 } },
      { kind: 'press', buttons: ['B', 'Up'], frames: 1 },
    ]
    expect(shown(play(steps, 9))).toEqual(['A', 'A', '-', '-', 'A', 'A', '-', '-', 'B+Up'])
  })

  it('holds the `held` buttons of a mash on every frame beside the mashed ones', () => {
    const steps: MacroStep[] = [
      { kind: 'mash', frames: 4, mash: { buttons: ['A'], every: 2, hold: 1, held: ['Down'] } },
    ]
    expect(shown(play(steps, 4))).toEqual(['Down+A', 'Down', 'Down+A', 'Down'])
  })

  it('reports a mark on the frame of the next step, and a last mark with the end', () => {
    const steps: MacroStep[] = [
      { kind: 'wait', frames: 1 },
      { kind: 'mark', name: 'title' },
      { kind: 'press', buttons: ['Start'], frames: 1 },
      { kind: 'mark', name: 'menu' },
    ]
    const inputs = play(steps, 3)
    expect(inputs.map((input) => input.marks)).toEqual([[], ['title'], ['menu']])
    expect(inputs[1]?.buttons).toEqual(['Start'])
    expect(inputs[2]?.done).toBe(true)
  })

  // Scene: a macro that loses sync stops at the step where it lost it, not 10 minutes later.
  it('gives up on an until step after its limit and names the step and the failing check', () => {
    const steps: MacroStep[] = [
      { kind: 'wait', frames: 2 },
      {
        kind: 'until',
        name: 'battle',
        checks: [{ name: 'mode', address: 0x02100000, width: 4, oneOf: [1] }],
        holdFor: 1,
        limit: 5,
        mash: { buttons: ['A'], every: 2, hold: 1 },
      },
      { kind: 'press', buttons: ['B'], frames: 1 },
    ]
    const inputs = play(steps, 9)
    expect(shown(inputs.slice(0, 7))).toEqual(['-', '-', 'A', '-', 'A', '-', 'A'])
    const failed =
      'step 1 "battle" did not hold within 5 frames; last: mode read 0x0, not one of 0x1'
    expect(inputs[7]).toEqual({ buttons: [], marks: [], step: 1, done: true, failed })
    expect(inputs[8]?.failed).toBe(failed)
  })

  it('passes an until step once its checks held for `holdFor` frames in a row', () => {
    let value = 0
    const read: ReadRam = () => value
    const player = macroPlayer([
      {
        kind: 'until',
        name: 'menu',
        checks: [{ name: 'flag', address: 0x02100000, width: 1, oneOf: [1] }],
        holdFor: 2,
        limit: 10,
      },
      { kind: 'press', buttons: ['A'], frames: 1 },
    ])
    const frames = [0, 1, 0, 1, 1, 1].map((next) => {
      value = next
      return player.next(read).buttons.join('')
    })
    expect(frames).toEqual(['', '', '', '', 'A', ''])
  })
})

describe('macroPlayer with writes and frames on the way', () => {
  const block: MemoryWrite = {
    kind: 'bytes',
    field: 'sendCmd.data',
    address: 0x02100014,
    bytes: [9],
  }

  // Scene: the page writes a block between two frames, and the next until step must read RAM
  // only after the game ran a frame with the block in place.
  it("takes one frame for a write step and hands its writes over on that frame's input", () => {
    const steps: MacroStep[] = [
      { kind: 'press', buttons: ['A'], frames: 1 },
      { kind: 'write', name: 'block', writes: [block] },
      { kind: 'mark', name: 'after' },
      { kind: 'wait', frames: 1 },
    ]
    const inputs = play(steps, 4)
    expect(inputs[0]?.writes).toBeUndefined()
    expect(inputs[1]).toEqual({ buttons: [], marks: [], step: 1, done: false, writes: [block] })
    expect(inputs[2]).toEqual({ buttons: [], marks: ['after'], step: 3, done: false })
    expect(inputs[3]?.done).toBe(true)
  })

  // Scene: while the client plays a block, the run needs a frame every few frames until it
  // answers, without a mark step for each.
  it('marks an until step every `markEvery` frames it waits, numbered from 1', () => {
    let value = 0
    const read: ReadRam = () => value
    const player = macroPlayer([
      {
        kind: 'until',
        name: 'b1',
        checks: [{ name: 'returned', address: 0x02100000, width: 1, oneOf: [1] }],
        holdFor: 1,
        limit: 100,
        markEvery: 3,
      },
    ])
    const marks = Array.from({ length: 8 }, (_, frame) => {
      value = frame === 7 ? 1 : 0
      return player.next(read).marks.join('+')
    })
    expect(marks).toEqual(['b1-001', '', '', 'b1-002', '', '', 'b1-003', ''])
  })
})

describe('routeSlice', () => {
  const route: MacroStep[] = [
    { kind: 'wait', frames: 5 },
    { kind: 'mark', name: 'title' },
    { kind: 'press', buttons: ['A'], frames: 1 },
    { kind: 'mark', name: 'menu' },
    { kind: 'wait', frames: 3 },
  ]

  it('starts after the `from` mark and ends with the `to` mark', () => {
    expect(routeSlice(route, undefined, 'title')).toEqual(route.slice(0, 2))
    expect(routeSlice(route, 'title', 'menu')).toEqual(route.slice(2, 4))
    expect(routeSlice(route, 'menu', undefined)).toEqual(route.slice(4))
  })

  it('refuses a mark the route lacks and a `to` before `from`', () => {
    expect(() => routeSlice(route, 'battle', undefined)).toThrow('The route has no mark "battle".')
    expect(() => routeSlice(route, 'menu', 'title')).toThrow('"title" comes before "menu"')
  })
})

describe('buttonChanges', () => {
  it('releases what is no longer held and presses what is new, by libretro index', () => {
    expect(buttonChanges(['A', 'Up'], ['Up', 'B'])).toEqual([
      { index: BUTTON.A, value: 0 },
      { index: BUTTON.B, value: 1 },
    ])
    expect(BUTTON.Start).toBe(3)
    expect(BUTTON.A).toBe(8)
  })
})
