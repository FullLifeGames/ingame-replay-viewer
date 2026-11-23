// The mGBA oracle of our platform layer (#43, plan B3, section 2.3): `npm run wasm:oracle --
// [<stream> ...] [--every <n>]`. The shot tool plays each stream's ROM from `npm run rom:shots`
// in mGBA and dumps mGBA's video state and frame every n frames (rom/gen3/shot/replay_state.c);
// this script draws each state with our renderer in the host harness and compares it with mGBA's
// frame line by line. Both images come from one mGBA instant, so no difference of pace enters.
// mGBA applies the colour special effects to 8-bit channels, so a pixel with an effect is held
// against mGBA's arithmetic on our layers and effect, from the harness's trace (mgbaRgb), and the
// pixel we drew is held against GBATEK's 5-bit result of the same trace (gbatekColour).
// The report goes to build/wasm/oracle/report.json, the first ten differences of each stream as
// side-by-side PPMs (ours left) next to the dumps.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { nmOutput } from './rom-build.ts'
import { runCli } from './rom-cli.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { buildPaths, emptyInside, removeInside, REPO_DIR } from './rom-paths.ts'
import { readPpm } from './rom-shot-probes.ts'
import type { Frame } from './rom-shot-probes.ts'
import {
  buildTool,
  PROGRESS_HEADER_PATH,
  progressAddress,
  readProgressLayout,
  runTool,
} from './rom-shot-run.ts'
import { wasmPaths, wasmRoots } from './wasm-compile.ts'
import { buildHost } from './wasm-layer.ts'
import { FRAME_BYTES, runScript, TRACE_BYTES, traceFrame } from './wasm-layer-script.ts'
import { diffFrame, parseVideoState, sideBySide, stateOps } from './wasm-oracle-state.ts'
import type { FrameDiff, VideoState } from './wasm-oracle-state.ts'

const DEFAULT_STREAMS = ['hand-made', '994052']
const DEFAULT_EVERY = 60
const CROPS = 10

export interface OracleArgs {
  streams: string[]
  every: number
}

export function parseOracleArgs(argv: string[]): OracleArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { every: { type: 'string' } },
    allowPositionals: true,
  })
  const every = values.every === undefined ? DEFAULT_EVERY : Number(values.every)
  if (!Number.isInteger(every) || every < 1) {
    throw new Error(`--every takes a whole number of frames from 1, not "${String(values.every)}"`)
  }
  return { streams: positionals.length > 0 ? positionals : DEFAULT_STREAMS, every }
}

/** The frames of the states in a dump folder, in order. */
export function stateFrames(files: readonly string[]): number[] {
  return files
    .flatMap((name) => /^state-(\d+)\.bin$/.exec(name)?.[1] ?? [])
    .map(Number)
    .sort((a, b) => a - b)
}

/** One state's verdict against mGBA's frame of the same call and the one after. */
export interface Compared {
  frame: number
  same: FrameDiff
  next?: FrameDiff
}

export interface StreamReport {
  name: string
  states: number
  /** Equal frames when a state is paired with its own frame, and with the next one. */
  equal: { same: number; next: number }
  /** `offTrace`: the differing pixels we drew other than GBATEK's result of their trace. */
  differing: { frame: number; pixels: number; lines: number; firstLine: number; offTrace: number }[]
}

export function summarize(name: string, compared: readonly Compared[]): StreamReport {
  const equal = {
    same: compared.filter((c) => c.same.pixels === 0).length,
    next: compared.filter((c) => c.next?.pixels === 0).length,
  }
  const differing = compared
    .filter((c) => c.same.pixels > 0)
    .map((c) => ({
      frame: c.frame,
      pixels: c.same.pixels,
      lines: c.same.lines.length,
      firstLine: c.same.lines[0]?.line ?? -1,
      offTrace: c.same.offTrace ?? 0,
    }))
  return { name, states: compared.length, equal, differing }
}

/** Our frame of the state, and the harness's trace of it. */
function drawState(host: string, state: VideoState): { ours: Uint16Array; trace: Uint8Array } {
  const ops = [...stateOps(state), traceFrame]
  const { dest } = runScript(host, ops, FRAME_BYTES + TRACE_BYTES)
  return {
    ours: new Uint16Array(dest.buffer, dest.byteOffset, FRAME_BYTES / 2),
    trace: dest.subarray(FRAME_BYTES),
  }
}

function readFrame(dir: string, at: number): Frame | undefined {
  const path = join(dir, `frame-${String(at)}.ppm`)
  return existsSync(path) ? readPpm(readFileSync(path)) : undefined
}

function compareDump(host: string, dir: string): Compared[] {
  const compared: Compared[] = []
  let crops = 0
  for (const at of stateFrames(readdirSync(dir))) {
    const { ours, trace } = drawState(
      host,
      parseVideoState(readFileSync(join(dir, `state-${String(at)}.bin`))),
    )
    const same = readFrame(dir, at)
    if (same === undefined) throw new Error(`${dir}: state ${String(at)} has no frame`)
    const next = readFrame(dir, at + 1)
    const entry: Compared = { frame: at, same: diffFrame(ours, same, trace) }
    if (next !== undefined) entry.next = diffFrame(ours, next, trace)
    if (entry.same.pixels > 0 && crops++ < CROPS) {
      writeFileSync(join(dir, `diff-${String(at)}.ppm`), sideBySide(ours, same))
    }
    compared.push(entry)
  }
  return compared
}

const say = (line: string) => process.stdout.write(`wasm:oracle: ${line}\n`)

function runOracle({ streams, every }: OracleArgs): void {
  const paths = buildPaths()
  const tool = join(paths.outDir, 'shot', 'replay_shot')
  buildTool(tool)
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const address = progressAddress(nmOutput(join(paths.outDir, OUTPUT_NAMES.elf)), layout.size)
  const oracleDir = join(wasmPaths(REPO_DIR).out, 'oracle')
  const roots = wasmRoots(REPO_DIR)
  // The harness and its call folders live in build/wasm/oracle/host and leave through the guard.
  const hostDir = join(oracleDir, 'host')
  const reports: StreamReport[] = []
  emptyInside(roots, oracleDir)
  mkdirSync(hostDir, { recursive: true })
  try {
    const host = buildHost(hostDir)
    for (const name of streams) {
      const rom = join(paths.outDir, 'shots', `${name}.gba`)
      if (!existsSync(rom)) throw new Error(`no ${rom}; run npm run rom:shots -- ${name} first`)
      const frameDir = join(oracleDir, name)
      mkdirSync(frameDir, { recursive: true })
      const output = runTool({ tool, rom, address, frameDir, shots: [], stateEvery: every })
      const report = summarize(name, compareDump(host, frameDir))
      say(
        `${name}: ${output.status.status} after ${String(output.status.frame)} frames; ${String(report.states)} states, equal ${String(report.equal.same)} to their own frame, ${String(report.equal.next)} to the next`,
      )
      reports.push(report)
    }
  } finally {
    removeInside(roots, hostDir)
  }
  writeFileSync(join(oracleDir, 'report.json'), `${JSON.stringify(reports, null, 2)}\n`)
  say(`report.json and the differences in ${oracleDir}`)
}

if (import.meta.main) {
  runCli('wasm:oracle', () => {
    runOracle(parseOracleArgs(process.argv.slice(2)))
  })
}
