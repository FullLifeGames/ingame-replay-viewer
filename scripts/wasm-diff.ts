// The scene diff of the WebAssembly build (#43, plan section 2.3): `node scripts/wasm-diff.ts
// [<stream> ...]`. For each scene frame that `npm run wasm:run` wrote to build/wasm/run/<stream>/,
// it counts the pixels that differ from mGBA's frame of the same scene in
// build/rom/shots/<stream>/ (from `npm run rom:shots`) and boxes them. A scene in mid-animation
// stands a few frames apart between the two engines, so this reports and does not gate; the mGBA
// oracle (`npm run wasm:oracle`) checks the renderer without that gap.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runCli } from './rom-cli.ts'
import { buildPaths, REPO_DIR } from './rom-paths.ts'
import { readPpm } from './rom-shot-probes.ts'
import type { Frame } from './rom-shot-probes.ts'
import { wasmPaths } from './wasm-compile.ts'

const DEFAULT_STREAMS = ['hand-made', '994052']
const FINAL = 'final.ppm'

export interface PixelDiff {
  pixels: number
  /** The box around the differing pixels, edges included; none when the frames are equal. */
  box?: { x0: number; y0: number; x1: number; y1: number }
}

export interface SceneDiff {
  scene: string
  diff: PixelDiff
}

const samePixel = (ours: Frame, theirs: Frame, at: number) =>
  ours.rgb[at] === theirs.rgb[at] &&
  ours.rgb[at + 1] === theirs.rgb[at + 1] &&
  ours.rgb[at + 2] === theirs.rgb[at + 2]

export function framePixelDiff(ours: Frame, theirs: Frame): PixelDiff {
  if (ours.width !== theirs.width || ours.height !== theirs.height) {
    throw new Error(
      `the frames differ in size: ${String(ours.width)}x${String(ours.height)} against ${String(theirs.width)}x${String(theirs.height)}`,
    )
  }
  let pixels = 0
  const box = { x0: ours.width, y0: ours.height, x1: -1, y1: -1 }
  for (let i = 0; i < ours.width * ours.height; i++) {
    if (samePixel(ours, theirs, 3 * i)) continue
    pixels++
    const x = i % ours.width
    const y = Math.floor(i / ours.width)
    box.x0 = Math.min(box.x0, x)
    box.y0 = Math.min(box.y0, y)
    box.x1 = Math.max(box.x1, x)
    box.y1 = Math.max(box.y1, y)
  }
  return pixels === 0 ? { pixels } : { pixels, box }
}

export function sceneDiffLine(stream: string, scene: string, { pixels, box }: PixelDiff): string {
  const where =
    box === undefined
      ? ''
      : ` in x ${String(box.x0)}-${String(box.x1)}, y ${String(box.y0)}-${String(box.y1)}`
  return `${stream}/${scene}: ${String(pixels)} pixels differ${where}`
}

/** Each scene frame of our folder against mGBA's, by name; the final frame is no scene. */
export function diffScenes(oursDir: string, theirsDir: string): SceneDiff[] {
  const names = readdirSync(oursDir)
    .filter((name) => name.endsWith('.ppm') && name !== FINAL)
    .sort()
  return names.map((name) => {
    const theirs = join(theirsDir, name)
    if (!existsSync(theirs)) throw new Error(`no mGBA frame ${theirs}; run npm run rom:shots first`)
    const diff = framePixelDiff(
      readPpm(readFileSync(join(oursDir, name))),
      readPpm(readFileSync(theirs)),
    )
    return { scene: name.slice(0, -'.ppm'.length), diff }
  })
}

if (import.meta.main) {
  runCli('wasm:diff', () => {
    const streams = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_STREAMS
    const shots = join(buildPaths(REPO_DIR).outDir, 'shots')
    const runs = join(wasmPaths(REPO_DIR).out, 'run')
    for (const stream of streams) {
      for (const { scene, diff } of diffScenes(join(runs, stream), join(shots, stream))) {
        process.stdout.write(`${sceneDiffLine(stream, scene, diff)}\n`)
      }
    }
  })
}
