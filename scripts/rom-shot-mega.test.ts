import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Instruction } from '../src/gen3/stream/instructions.ts'
import { LEADS, streamOf } from '../src/gen3/stream/testing.ts'

import { megaScene, megaSpriteScene } from './rom-shot-mega.ts'
import { SCREEN } from './rom-shot-probes.ts'
import type { Region } from './rom-shot-probes.ts'
import { missingScenes, scenesOf } from './rom-shot-scenes.ts'
import { decodeStream, handMadeStream, replayBytes } from './rom-shot-stream.ts'

// LEADS holds INTRO and both send-outs, so the MEGA_EVOLVE is op 5.
const megaEvolving = (side: 'near' | 'far'): readonly Instruction[] => [
  ...LEADS,
  { op: 'flushTextBox' },
  { op: 'print', text: "Venusaur's Venusaurite is reacting to the Mega Ring!" },
  { op: 'megaEvolve', side, species: 906 },
  { op: 'print', text: 'Venusaur has Mega Evolved into Mega Venusaur!' },
  { op: 'end', outcome: 'tie' },
]

const fixtureStream = (name: string) =>
  decodeStream(
    replayBytes(
      JSON.parse(
        readFileSync(new URL(`../test/fixtures/replays/${name}.json`, import.meta.url), 'utf8'),
      ),
    ),
  )

const scenes = (instructions: readonly Instruction[]) => {
  const stream = streamOf(instructions)
  return [megaScene(stream), megaSpriteScene(stream)]
}

describe('the first Mega Evolution, on the screen (#126)', () => {
  it('shoots the frame before the first MEGA_EVOLVE and the frame after it, twice', () => {
    const [box, sprite] = scenes(megaEvolving('far'))
    expect(box?.name).toBe('first-mega')
    expect(box?.shots).toEqual([
      { name: 'first-mega-before', done: 5, frames: 0 },
      { name: 'first-mega', done: 6, frames: 0 },
    ])
    expect(sprite?.name).toBe('first-mega-sprite')
    expect(sprite?.shots).toEqual([
      { name: 'first-mega-sprite-before', done: 5, frames: 0 },
      { name: 'first-mega-sprite', done: 6, frames: 0 },
    ])
  })

  it("looks at the Mega's healthbox and at its sprite, near or far", () => {
    for (const side of ['near', 'far'] as const) {
      const [box, sprite] = scenes(megaEvolving(side))
      expect(box?.check).toEqual({
        probe: 'differs',
        before: 'first-mega-before',
        after: 'first-mega',
        region: SCREEN.healthbox[side],
      })
      expect(sprite?.check).toEqual({
        probe: 'differs',
        before: 'first-mega-sprite-before',
        after: 'first-mega-sprite',
        region: SCREEN.mon[side],
      })
    }
  })

  it('takes the first of two MEGA_EVOLVE ops', () => {
    const twice = megaEvolving('far').toSpliced(-1, 0, {
      op: 'megaEvolve',
      side: 'near',
      species: 912,
    })
    for (const scene of scenes(twice)) expect(scene?.shots[0]?.done).toBe(5)
    expect(megaSpriteScene(streamOf(twice))?.check).toMatchObject({ region: SCREEN.mon.far })
  })

  it('has neither scene for a stream without a MEGA_EVOLVE', () => {
    const none = megaEvolving('near').filter((instruction) => instruction.op !== 'megaEvolve')
    expect(scenes(none)).toEqual([undefined, undefined])
    expect(megaScene(handMadeStream())).toBe(undefined)
    expect(megaSpriteScene(handMadeStream())).toBe(undefined)
  })

  it("finds 995596's far Venusaur at op 71 and 2719620803's far Medicham at op 17", () => {
    const venusaur = fixtureStream('smogtours-gen6ou-995596')
    expect(venusaur.instructions[71]).toEqual({ op: 'megaEvolve', side: 'far', species: 906 })
    expect(megaScene(venusaur)?.shots[0]?.done).toBe(71)
    expect(megaSpriteScene(venusaur)?.check).toMatchObject({ region: SCREEN.mon.far })
    const medicham = fixtureStream('gen6ou-2719620803')
    expect(medicham.instructions[17]).toEqual({ op: 'megaEvolve', side: 'far', species: 934 })
    expect(megaScene(medicham)?.shots[0]?.done).toBe(17)
    expect(megaScene(medicham)?.check).toMatchObject({ region: SCREEN.healthbox.far })
  })

  it('places both Mega scenes after the first Terastallization and before the first move', () => {
    const mega: readonly Instruction[] = [
      ...LEADS,
      { op: 'megaEvolve', side: 'near', species: 906 },
      { op: 'move', user: 'near', target: 'far', move: 89, animTurn: 0 },
      { op: 'end', outcome: 'tie' },
    ]
    const names = scenesOf(streamOf(mega)).map((scene) => scene.name)
    expect(names.slice(names.indexOf('level'), names.indexOf('first-move') + 1)).toEqual([
      'level',
      'first-mega',
      'first-mega-sprite',
      'first-move',
    ])
    expect(missingScenes(streamOf(mega))).toContain('first-tera')
    expect(missingScenes(streamOf(mega))).not.toContain('first-mega')
    expect(missingScenes(streamOf(mega))).not.toContain('first-mega-sprite')
  })
})

describe('the regions of a Mega sprite (#126)', () => {
  const inside = (outer: Region, x: number, y: number) =>
    x >= outer.x && y >= outer.y && x < outer.x + outer.width && y < outer.y + outer.height
  const overlaps = (a: Region, b: Region) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

  it('touch neither healthbox nor the text box, and lie on the screen', () => {
    for (const side of ['near', 'far'] as const) {
      const mon = SCREEN.mon[side]
      expect(inside(SCREEN.screen, mon.x, mon.y)).toBe(true)
      expect(inside(SCREEN.screen, mon.x + mon.width - 1, mon.y + mon.height - 1)).toBe(true)
      expect(overlaps(mon, SCREEN.healthbox.near)).toBe(false)
      expect(overlaps(mon, SCREEN.healthbox.far)).toBe(false)
      expect(overlaps(mon, SCREEN.message)).toBe(false)
    }
  })
})
