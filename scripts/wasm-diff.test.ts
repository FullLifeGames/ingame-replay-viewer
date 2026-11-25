import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { diffScenes, framePixelDiff, sceneDiffLine } from './wasm-diff.ts'
import type { Frame } from './rom-shot-probes.ts'

const blank = (width = 4, height = 3): Frame => ({
  width,
  height,
  rgb: new Uint8Array(width * height * 3),
})

const ppm = (frame: Frame) =>
  Buffer.concat([
    Buffer.from(`P6\n${String(frame.width)} ${String(frame.height)}\n255\n`, 'latin1'),
    frame.rgb,
  ])

describe('framePixelDiff', () => {
  it('counts the pixels that differ in any channel and boxes them', () => {
    const theirs = blank()
    const ours = blank()
    ours.rgb[3 * (1 * 4 + 1) + 2] = 8
    ours.rgb[3 * (2 * 4 + 3)] = 8
    expect(framePixelDiff(ours, theirs)).toEqual({ pixels: 2, box: { x0: 1, y0: 1, x1: 3, y1: 2 } })
  })

  it('reports no box for equal frames', () => {
    expect(framePixelDiff(blank(), blank())).toEqual({ pixels: 0 })
  })

  it('refuses frames of different sizes', () => {
    expect(() => framePixelDiff(blank(4, 3), blank(3, 4))).toThrow(/4x3 against 3x4/)
  })
})

describe('sceneDiffLine', () => {
  it('names the scene, the count and the box', () => {
    expect(
      sceneDiffLine('hand-made', 'level', { pixels: 2, box: { x0: 1, y0: 1, x1: 3, y1: 2 } }),
    ).toBe('hand-made/level: 2 pixels differ in x 1-3, y 1-2')
    expect(sceneDiffLine('hand-made', 'level', { pixels: 0 })).toBe(
      'hand-made/level: 0 pixels differ',
    )
  })
})

describe('diffScenes', () => {
  const root = mkdtempSync(join(tmpdir(), 'irv-diff-'))
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })
  const ours = join(root, 'ours')
  const theirs = join(root, 'theirs')
  mkdirSync(ours)
  mkdirSync(theirs)

  it('compares each scene frame of our run with mGBA’s, skipping final.ppm', () => {
    const changed = blank()
    changed.rgb[0] = 1
    writeFileSync(join(ours, 'level.ppm'), ppm(changed))
    writeFileSync(join(theirs, 'level.ppm'), ppm(blank()))
    writeFileSync(join(ours, 'held.ppm'), ppm(blank()))
    writeFileSync(join(theirs, 'held.ppm'), ppm(blank()))
    writeFileSync(join(ours, 'final.ppm'), ppm(changed))
    writeFileSync(join(ours, 'lines.crc'), 'x')
    expect(diffScenes(ours, theirs)).toEqual([
      { scene: 'held', diff: { pixels: 0 } },
      { scene: 'level', diff: { pixels: 1, box: { x0: 0, y0: 0, x1: 0, y1: 0 } } },
    ])
  })

  it('compares the final frame of a refused run, which writes no scene frame', () => {
    const refusedOurs = join(root, 'refused-ours')
    const refusedTheirs = join(root, 'refused-theirs')
    mkdirSync(refusedOurs)
    mkdirSync(refusedTheirs)
    const changed = blank()
    changed.rgb[3 * (2 * 4 + 1)] = 8
    writeFileSync(join(refusedOurs, 'final.ppm'), ppm(changed))
    writeFileSync(join(refusedOurs, 'op-frames.txt'), 'op-frames 1 module version-4\n')
    writeFileSync(join(refusedTheirs, 'final.ppm'), ppm(blank()))
    expect(diffScenes(refusedOurs, refusedTheirs)).toEqual([
      { scene: 'final', diff: { pixels: 1, box: { x0: 1, y0: 2, x1: 1, y1: 2 } } },
    ])
  })

  it('names a refused run whose final frame mGBA lacks', () => {
    const refusedOurs = join(root, 'refused-alone')
    mkdirSync(refusedOurs)
    writeFileSync(join(refusedOurs, 'final.ppm'), ppm(blank()))
    expect(() => diffScenes(refusedOurs, join(root, 'theirs'))).toThrow(
      /no mGBA frame .*final\.ppm/,
    )
  })

  it('names a scene that mGBA has no frame for', () => {
    writeFileSync(join(ours, 'win.ppm'), ppm(blank()))
    expect(() => diffScenes(ours, theirs)).toThrow(/no mGBA frame .*win\.ppm/)
  })
})
