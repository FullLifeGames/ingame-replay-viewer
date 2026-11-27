import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Instruction } from '../src/gen3/stream/instructions.ts'
import { LEADS, streamOf } from '../src/gen3/stream/testing.ts'

import { SCREEN } from './rom-shot-probes.ts'
import { missingScenes, scenesOf } from './rom-shot-scenes.ts'
import { decodeStream, handMadeStream, replayBytes } from './rom-shot-stream.ts'
import { teraScene } from './rom-shot-tera.ts'

// LEADS holds INTRO and both send-outs, so the TERA is op 5.
const terastallizing = (side: 'near' | 'far'): readonly Instruction[] => [
  ...LEADS,
  { op: 'flushTextBox' },
  { op: 'print', text: 'Gliscor is storing energy!' },
  { op: 'tera', side, teraType: 19 },
  { op: 'print', text: 'Gliscor terastallized into the Fairy type!' },
  { op: 'end', outcome: 'tie' },
]

const sceneOf = (instructions: readonly Instruction[]) => teraScene(streamOf(instructions))

const fixtureStream = (name: string) =>
  decodeStream(
    replayBytes(
      JSON.parse(
        readFileSync(new URL(`../test/fixtures/replays/${name}.json`, import.meta.url), 'utf8'),
      ),
    ),
  )

describe('the first Terastallization, on the screen (#89)', () => {
  it('shoots the frame before the first TERA and the frame after it', () => {
    const scene = sceneOf(terastallizing('near'))
    expect(scene?.name).toBe('first-tera')
    expect(scene?.shots).toEqual([
      { name: 'first-tera-before', done: 5, frames: 0 },
      { name: 'first-tera', done: 6, frames: 0 },
    ])
  })

  it("looks at the Terastallized mon's healthbox, near or far", () => {
    for (const side of ['near', 'far'] as const) {
      expect(sceneOf(terastallizing(side))?.check).toEqual({
        probe: 'differs',
        before: 'first-tera-before',
        after: 'first-tera',
        region: SCREEN.healthbox[side],
      })
    }
  })

  it('takes the first of two TERA ops', () => {
    const twice = terastallizing('far').toSpliced(-1, 0, { op: 'tera', side: 'near', teraType: 4 })
    expect(sceneOf(twice)?.shots[0]?.done).toBe(5)
    expect(sceneOf(twice)?.check).toMatchObject({ region: SCREEN.healthbox.far })
  })

  it('has no scene for a stream without a TERA', () => {
    const none = terastallizing('near').filter((instruction) => instruction.op !== 'tera')
    expect(sceneOf(none)).toBe(undefined)
    expect(teraScene(handMadeStream())).toBe(undefined)
  })

  // 886489's far Tera follows six Ivy Cudgels, each with its MOVE_TYPE since #89: op 499 became 505.
  it("finds 886489's far Tera into Normal and 2719598518's near Tera into Poison", () => {
    const far = fixtureStream('smogtours-gen9ou-886489')
    expect(far.instructions[505]).toEqual({ op: 'tera', side: 'far', teraType: 1 })
    expect(teraScene(far)?.shots[0]?.done).toBe(505)
    expect(teraScene(far)?.check).toMatchObject({ region: SCREEN.healthbox.far })
    const near = fixtureStream('gen9ou-2719598518')
    expect(near.instructions[103]).toEqual({ op: 'tera', side: 'near', teraType: 4 })
    expect(teraScene(near)?.shots[0]?.done).toBe(103)
    expect(teraScene(near)?.check).toMatchObject({ region: SCREEN.healthbox.near })
  })

  it('places the first Terastallization after the weather and before the first move (#89)', () => {
    const tera: readonly Instruction[] = [
      ...LEADS,
      { op: 'tera', side: 'near', teraType: 19 },
      { op: 'move', user: 'near', target: 'far', move: 89, animTurn: 0 },
      { op: 'end', outcome: 'tie' },
    ]
    const names = scenesOf(streamOf(tera)).map((scene) => scene.name)
    expect(names.slice(names.indexOf('level'), names.indexOf('first-move') + 1)).toEqual([
      'level',
      'first-tera',
      'first-move',
    ])
    expect(missingScenes(streamOf(tera))).toContain('weather-start')
    expect(missingScenes(streamOf(tera))).not.toContain('first-tera')
  })
})
