import { describe, expect, it } from 'vitest'

import type { Instruction, Stream } from '../src/gen3/stream/instructions.ts'
import { streamOf } from '../src/gen3/stream/testing.ts'
import type { Side } from '../src/script/types.ts'

import { ballScene } from './rom-shot-balls.ts'
import { handMadeStream } from './rom-shot-stream.ts'

const SEND_OUTS: readonly Instruction[] = [
  { op: 'intro' },
  { op: 'print', text: 'xXEricXx would like to battle!' },
  { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
  { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
  { op: 'end', outcome: 'tie' },
]

function withTeamSize(side: Side, teamSize: number): Stream {
  const stream = streamOf(SEND_OUTS)
  const trainer = { ...stream.trainers[side], teamSize }
  return { ...stream, trainers: { ...stream.trainers, [side]: trainer } }
}

const cell = (x: number, y: number) => ({ x, y, width: 8, height: 8 })
const expectedBalls = (stream: Stream, side: Side) => {
  const check = ballScene(stream, side)?.check
  return check?.probe === 'balls' ? check.balls : undefined
}

describe('the ball display of each side before the first SEND_OUT (#21)', () => {
  it('shoots the frame before the first SEND_OUT, with both displays up', () => {
    const scene = ballScene(streamOf(SEND_OUTS), 'near')
    expect(scene?.name).toBe('near-balls')
    expect(scene?.shots).toEqual([{ name: 'near-balls', done: 2, frames: 0 }])
    expect(ballScene(streamOf(SEND_OUTS), 'far')?.shots).toEqual([
      { name: 'far-balls', done: 2, frames: 0 },
    ])
  })

  it('looks at the near cells from the left, where the near balls start', () => {
    expect(ballScene(streamOf(SEND_OUTS), 'near')?.check).toEqual({
      probe: 'balls',
      shot: 'near-balls',
      cells: [156, 166, 176, 186, 196, 206].map((x) => cell(x, 88)),
      colour: 0xf79473,
      balls: 6,
    })
  })

  it('looks at the far cells from the right, where the far balls start', () => {
    expect(ballScene(streamOf(SEND_OUTS), 'far')?.check).toEqual({
      probe: 'balls',
      shot: 'far-balls',
      cells: [76, 66, 56, 46, 36, 26].map((x) => cell(x, 32)),
      colour: 0xf79473,
      balls: 6,
    })
  })

  it('expects a ball for each member of the team, revealed or not', () => {
    expect(expectedBalls(withTeamSize('near', 4), 'near')).toBe(4)
    expect(expectedBalls(withTeamSize('far', 6), 'far')).toBe(6)
  })

  it('expects no more balls than a party holds', () => {
    expect(expectedBalls(withTeamSize('near', 9), 'near')).toBe(6)
  })

  it('expects every revealed mon when the team size is below their count', () => {
    expect(expectedBalls(withTeamSize('near', 1), 'near')).toBe(2)
  })

  it('has no scene in a stream without a SEND_OUT', () => {
    expect(ballScene(streamOf([{ op: 'intro' }, { op: 'end', outcome: 'tie' }]), 'near')).toBe(
      undefined,
    )
  })

  it('gives the hand-made stream an unrevealed near member and five empty far slots', () => {
    expect(expectedBalls(handMadeStream(), 'near')).toBe(3)
    expect(expectedBalls(handMadeStream(), 'far')).toBe(1)
  })
})
