import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildGen3Stream } from '../src/gen3/backend.ts'
import { buildBattleScript } from '../src/script/build.ts'
import { readReplay } from '../src/script/replay.ts'
import {
  decodeStream,
  handMadeBytes,
  handMadeStream,
  replayBytes,
  withVersion,
} from './rom-shot-stream.ts'

describe('the hand-made stream of the screenshot run', () => {
  it('encodes and decodes back to itself', () => {
    expect(decodeStream(handMadeBytes())).toEqual(handMadeStream())
  })

  it('holds every scene the run checks, and ends with the win line and END', () => {
    const ops = handMadeStream().instructions.map((instruction) => instruction.op)
    for (const op of [
      'intro',
      'sendOut',
      'weather',
      'anim',
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

describe('the stream of a test replay', () => {
  const json: unknown = JSON.parse(
    readFileSync(
      new URL('../test/fixtures/replays/smogtours-gen3ou-994052.json', import.meta.url),
      'utf8',
    ),
  )

  it('is the Gen 3 game backend’s stream of its battle log', () => {
    const { log } = readReplay(json)
    expect(replayBytes(json)).toEqual(buildGen3Stream(buildBattleScript(log)).bytes)
  })

  it('decodes from the intro to END', () => {
    const ops = decodeStream(replayBytes(json)).instructions.map((instruction) => instruction.op)
    expect(ops[0]).toBe('intro')
    expect(ops.at(-1)).toBe('end')
  })
})
