import { describe, expect, it } from 'vitest'

import { decodeStream, handMadeBytes, handMadeStream, withVersion } from './rom-shot-stream.ts'

describe('the hand-made stream of the screenshot run', () => {
  it('encodes and decodes back to itself', () => {
    expect(decodeStream(handMadeBytes())).toEqual(handMadeStream())
  })

  it('holds every scene the run checks, and ends with the win line and END', () => {
    const ops = handMadeStream().instructions.map((instruction) => instruction.op)
    for (const op of [
      'intro',
      'sendOut',
      'move',
      'hit',
      'hp',
      'status',
      'withdraw',
      'switchIn',
      'faint',
    ]) {
      expect(ops).toContain(op)
    }
    expect(ops.filter((op) => op === 'sendOut')).toHaveLength(2)
    expect(ops.slice(-2)).toEqual(['print', 'end'])
  })

  it('takes its species and moves from the expansion tables', () => {
    const { parties, instructions } = handMadeStream()
    expect(parties.near[0]?.species).toBe(51)
    expect(instructions.find((instruction) => instruction.op === 'move')).toMatchObject({
      move: 157,
    })
  })

  it('gives a copy with another version that the decoder refuses', () => {
    const bytes = handMadeBytes()
    const two = withVersion(bytes, 2)
    expect(two[0]).toBe(2)
    expect(bytes[0]).toBe(1)
    expect(() => decodeStream(two)).toThrow('stream version 2 is unknown')
  })
})
