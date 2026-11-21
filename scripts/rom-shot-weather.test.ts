import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Instruction } from '../src/gen3/stream/instructions.ts'
import { streamOf } from '../src/gen3/stream/testing.ts'

import { SCREEN } from './rom-shot-probes.ts'
import { decodeStream, handMadeStream, replayBytes } from './rom-shot-stream.ts'
import { weatherScene } from './rom-shot-weather.ts'

const SAND_STREAM: readonly Instruction[] = [
  { op: 'intro' },
  { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
  { op: 'ability', side: 'far', ability: 45, show: true },
  { op: 'weather', weather: 'sand' },
  { op: 'print', text: 'A sandstorm kicked up!' },
  { op: 'anim', side: 'near', anim: 'sandstormContinues' },
  { op: 'ability', side: 'far', ability: 45, show: false },
  { op: 'end', outcome: 'tie' },
]

const sceneOf = (instructions: readonly Instruction[]) => weatherScene(streamOf(instructions))

describe('the weather an ability starts, on the screen (#22)', () => {
  it('shoots the weather an ability starts 60 frames into its animation', () => {
    const scene = sceneOf(SAND_STREAM)
    expect(scene?.name).toBe('weather-start')
    expect(scene?.shots).toEqual([
      { name: 'weather-start-before', done: 5, frames: 0 },
      { name: 'weather-start', done: 5, frames: 60 },
    ])
    expect(scene?.check).toEqual({
      probe: 'differs',
      before: 'weather-start-before',
      after: 'weather-start',
      region: SCREEN.sky,
    })
  })

  it('looks at the sky above the far healthbox and left of the far mon', () => {
    expect(SCREEN.sky).toEqual({ x: 0, y: 0, width: 140, height: 14 })
    expect(SCREEN.sky.y + SCREEN.sky.height).toBeLessThanOrEqual(SCREEN.healthbox.far.y)
  })

  it('has no scene for a weather that ends', () => {
    const ended = SAND_STREAM.map((instruction) =>
      instruction.op === 'weather'
        ? { op: 'weather' as const, weather: 'none' as const }
        : instruction,
    )
    expect(sceneOf(ended)).toBe(undefined)
  })

  it('has no scene when another op than a PRINT stands between the weather and the animation', () => {
    const apart = SAND_STREAM.toSpliced(5, 0, { op: 'turn', number: 1 })
    expect(sceneOf(apart)).toBe(undefined)
  })

  it('has no scene for a weather with no animation after it', () => {
    expect(sceneOf(SAND_STREAM.filter((instruction) => instruction.op !== 'anim'))).toBe(undefined)
  })

  it('finds the sandstorm of the hand-made stream after both send-outs', () => {
    const { instructions } = handMadeStream()
    const at = weatherScene(handMadeStream())?.shots[0]?.done ?? -1
    expect(instructions[at]).toEqual({ op: 'anim', side: 'near', anim: 'sandstormContinues' })
    expect(instructions.slice(at - 2, at).map((instruction) => instruction.op)).toEqual([
      'weather',
      'print',
    ])
  })

  it('finds the Sand Stream of 994052 after both send-outs, inside its pop-up', () => {
    const json: unknown = JSON.parse(
      readFileSync(
        new URL('../test/fixtures/replays/smogtours-gen3ou-994052.json', import.meta.url),
        'utf8',
      ),
    )
    const stream = decodeStream(replayBytes(json))
    expect(weatherScene(stream)?.shots[1]).toEqual({
      name: 'weather-start',
      done: 9,
      frames: 60,
    })
    expect(stream.instructions.slice(6, 11).map((instruction) => instruction.op)).toEqual([
      'ability',
      'weather',
      'print',
      'anim',
      'ability',
    ])
  })
})
