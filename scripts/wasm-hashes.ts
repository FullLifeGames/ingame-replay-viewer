// The A/B check of the WebAssembly build (#43, plan 2.3): wasm:run hashes every frame of a run, one
// CRC32 per line, so a later module can be held frame by frame against the baseline, the module
// from before our platform layer swapped in. `--baseline` saves the module and its hashes in
// build/wasm/baseline (never committed), `--against-baseline` names the first frame that differs
// and its lines. The game never reads its frame, so a renderer change shows as differing lines,
// while a change that alters the game's state shows as other frame counts or a cascade.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { crc32 } from 'node:zlib'

import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/web/wasm/frame.ts'
import { LINK_OUTPUTS } from './wasm-link.ts'

const LINE_BYTES = FRAME_WIDTH * 2
const FRAME_BYTES = LINE_BYTES * FRAME_HEIGHT
const FIRST_FRAMES = 64

/** The line hashes of a run: FRAME_HEIGHT words per frame, frame 1 first. */
export interface RunHashes {
  frames: number
  lines: Uint32Array
}

/** Collects the line hashes of a run, one frame at a time. */
export class HashLog {
  private lines = new Uint32Array(FIRST_FRAMES * FRAME_HEIGHT)
  private frames = 0

  /** One frame as the module holds it: 240x160 BGR555 words, little-endian. */
  add(bytes: Uint8Array): void {
    if (bytes.length !== FRAME_BYTES) {
      throw new Error(`a frame takes ${String(FRAME_BYTES)} bytes, not ${String(bytes.length)}`)
    }
    if ((this.frames + 1) * FRAME_HEIGHT > this.lines.length) {
      const grown = new Uint32Array(this.lines.length * 2)
      grown.set(this.lines)
      this.lines = grown
    }
    const at = this.frames * FRAME_HEIGHT
    for (let line = 0; line < FRAME_HEIGHT; line++) {
      this.lines[at + line] = crc32(bytes.subarray(line * LINE_BYTES, (line + 1) * LINE_BYTES))
    }
    this.frames++
  }

  done(): RunHashes {
    return { frames: this.frames, lines: this.lines.slice(0, this.frames * FRAME_HEIGHT) }
  }
}

/** The line hashes of frame `frame`, counted from 1 as the run counts its frames. */
export function frameLines(hashes: RunHashes, frame: number): Uint32Array {
  if (!Number.isInteger(frame) || frame < 1 || frame > hashes.frames) {
    throw new Error(`no frame ${String(frame)} in a run of ${String(hashes.frames)} frames`)
  }
  return hashes.lines.subarray((frame - 1) * FRAME_HEIGHT, frame * FRAME_HEIGHT)
}

// Little-endian words, as both the module and every host it runs on store them.
export function writeHashes(path: string, hashes: RunHashes): void {
  writeFileSync(path, new Uint8Array(hashes.lines.buffer, 0, hashes.lines.byteLength))
}

export function readHashes(path: string): RunHashes {
  const bytes = readFileSync(path)
  if (bytes.length % (FRAME_HEIGHT * 4) !== 0) {
    throw new Error(`${path}: ${String(bytes.length)} bytes, not a whole number of frames`)
  }
  const lines = new Uint32Array(bytes.length / 4)
  new Uint8Array(lines.buffer).set(bytes)
  return { frames: lines.length / FRAME_HEIGHT, lines }
}

export function differingLines(a: Uint32Array, b: Uint32Array): number[] {
  const lines: number[] = []
  for (let line = 0; line < FRAME_HEIGHT; line++) if (a[line] !== b[line]) lines.push(line)
  return lines
}

export interface Difference {
  frame: number
  /** The lines of `frame` that differ; none when one run ended before it. */
  lines: number[]
}

export function firstDifference(base: RunHashes, run: RunHashes): Difference | undefined {
  const common = Math.min(base.frames, run.frames)
  for (let frame = 1; frame <= common; frame++) {
    const lines = differingLines(frameLines(base, frame), frameLines(run, frame))
    if (lines.length > 0) return { frame, lines }
  }
  return base.frames === run.frames ? undefined : { frame: common + 1, lines: [] }
}

export interface Comparison {
  name: string
  frames: { baseline: number; run: number }
  first?: Difference
  problems: string[]
}

// Consecutive lines as ranges: 3-4, 10, 20-159.
function lineRanges(lines: readonly number[]): string {
  const ranges: string[] = []
  let start = 0
  for (let i = 1; i <= lines.length; i++) {
    if (i < lines.length && lines[i] === (lines[i - 1] ?? 0) + 1) continue
    const [from, to] = [lines[start] ?? 0, lines[i - 1] ?? 0]
    ranges.push(from === to ? String(from) : `${String(from)}-${String(to)}`)
    start = i
  }
  return ranges.join(', ')
}

export function compareRuns(name: string, base: RunHashes, run: RunHashes): Comparison {
  const frames = { baseline: base.frames, run: run.frames }
  const first = firstDifference(base, run)
  if (first === undefined) return { name, frames, problems: [] }
  const problems: string[] = []
  if (base.frames !== run.frames) {
    problems.push(`${name}: ${String(run.frames)} frames, the baseline ${String(base.frames)}`)
  }
  if (first.lines.length > 0) {
    const count = String(first.lines.length)
    problems.push(
      `${name}: frame ${String(first.frame)} differs from the baseline in ${count} lines (${lineRanges(first.lines)})`,
    )
  }
  return { name, frames, first, problems }
}

export interface RunArgs {
  /** plain: scenes only; baseline: save the module and its hashes; against: compare with them. */
  mode: 'plain' | 'baseline' | 'against'
  names: string[]
}

export function parseRunArgs(argv: string[]): RunArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { baseline: { type: 'boolean' }, 'against-baseline': { type: 'boolean' } },
    allowPositionals: true,
  })
  if (values.baseline === true && values['against-baseline'] === true) {
    throw new Error('take one of --baseline and --against-baseline')
  }
  const mode =
    values.baseline === true ? 'baseline' : values['against-baseline'] ? 'against' : 'plain'
  return { mode, names: positionals }
}

const baselineDir = (out: string) => join(out, 'baseline')
const baselineHashes = (out: string, stream: string) => join(baselineDir(out), `${stream}.crc`)

/** Copies the module of build/wasm into build/wasm/baseline; a baseline is never overwritten. */
export function saveBaseline(out: string): string {
  const dir = baselineDir(out)
  if (existsSync(dir)) {
    throw new Error(`the baseline ${dir} exists; it is never overwritten, delete it by hand`)
  }
  const files = Object.values(LINK_OUTPUTS)
  const missing = files.filter((file) => !existsSync(join(out, file)))
  if (missing.length > 0)
    throw new Error(`no module to save: ${missing.join(', ')} missing in ${out}`)
  mkdirSync(dir)
  for (const file of files) copyFileSync(join(out, file), join(dir, file))
  return dir
}

/** Where a stream's run in build/wasm/run/<stream>/ leaves its line hashes. */
export const RUN_HASHES = 'lines.crc'

/** Before the runs: --baseline saves the module, --against-baseline needs a baseline per stream. */
export function startBaseline(
  mode: RunArgs['mode'],
  out: string,
  streams: readonly { name: string }[],
): void {
  if (mode === 'baseline') saveBaseline(out)
  if (mode !== 'against') return
  const missing = streams
    .map(({ name }) => name)
    .filter((name) => !existsSync(baselineHashes(out, name)))
  if (missing.length > 0) {
    throw new Error(
      `no baseline for ${missing.join(', ')} in ${baselineDir(out)}; run npm run wasm:run -- --baseline on the module before the change`,
    )
  }
}

export interface Settled {
  problems: string[]
  /** The line for the report when the run equals its baseline. */
  equal?: string
}

/** After one stream's run: its hashes go into the baseline, or are held against it. */
export function settleBaseline(
  { mode, out }: { mode: RunArgs['mode']; out: string },
  stream: string,
  hashesPath: string,
): Settled {
  if (mode === 'baseline') copyFileSync(hashesPath, baselineHashes(out, stream))
  if (mode !== 'against') return { problems: [] }
  const run = readHashes(hashesPath)
  const { problems } = compareRuns(stream, readHashes(baselineHashes(out, stream)), run)
  if (problems.length > 0) return { problems }
  return {
    problems,
    equal: `${stream}: ${String(run.frames)} frames, every frame equal to the baseline`,
  }
}
