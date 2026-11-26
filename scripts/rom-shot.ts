// npm run rom:shots [-- <name>...] (#7, plan section 7): plays streams in the built ROM from boot
// to END in headless mGBA and checks named scenes in its frames. A name is a test replay id (its
// stream comes from the Gen 3 game backend; 994052 when no name is given, S2a D5), hand-made (a
// short battle written with the stream encoder) or send-outs (the battles of
// scripts/wasm-sendouts.ts, one stream each, #66). When hand-made is named, hand-made-b follows it:
// the same stream with B held from the first frame, which must show every scene (#30, #68). Two
// refusal runs follow: the built ROM's empty slot (refused as EMPTY) and the hand-made stream with
// an unknown version (refused as VERSION).
// Frames, each stream's op frame log (op-frames.ts), the ROMs and report.json go to
// build/rom/shots/. Needs a ROM from npm run rom:build and libmgba-dev.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { runnerImport } from 'vite'

import type { Stream } from '../src/gen3/stream/instructions.ts'
import type { SlotDescription } from '../src/patch/slot.ts'
import { writeReplaySlot } from '../src/patch/slot.ts'
import { opFrameLog, writeOpFrames } from './op-frames.ts'
import { nmOutput } from './rom-build.ts'
import { runCliAsync } from './rom-cli.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { buildPaths, emptyInside, REPO_DIR } from './rom-paths.ts'
import type { BuildPaths } from './rom-paths.ts'
import { checkShots, readPpm } from './rom-shot-probes.ts'
import type { Frame } from './rom-shot-probes.ts'
import {
  buildTool,
  INTERPRETER_HEADER_PATH,
  judgeRun,
  PROGRESS_HEADER_PATH,
  progressAddress,
  readErrorNames,
  readProgressLayout,
  runTool,
} from './rom-shot-run.ts'
import type { ProgressLayout } from './rom-shot-run.ts'
import type { Expected, SceneVerdict, ToolOutput } from './rom-shot-run.ts'
import { missingScenes, refusalScenes, scenesOf, shotArgs } from './rom-shot-scenes.ts'
import type { Scene } from './rom-shot-scenes.ts'
import type * as ShotStream from './rom-shot-stream.ts'
import { SEND_OUTS } from './wasm-sendouts-name.ts'

const HAND_MADE = 'hand-made'
const DEFAULT_REPLAY = '994052'
const REPLAY_DIR = join(REPO_DIR, 'test', 'fixtures', 'replays')

/** The streams to play, by name: test replay ids and hand-made. */
export function parseShotArgs(argv: string[]): string[] {
  const { positionals } = parseArgs({ args: argv, options: {}, allowPositionals: true })
  positionals.forEach((name, i) => {
    if (name !== HAND_MADE && name !== SEND_OUTS && !/^\d+$/.test(name)) {
      throw new Error(
        `"${name}" is neither a test replay id (its digits, such as ${DEFAULT_REPLAY}), ${HAND_MADE} nor ${SEND_OUTS}`,
      )
    }
    if (positionals.indexOf(name) !== i) {
      throw new Error(`"${name}" is named twice; each stream writes its frames into its own folder`)
    }
  })
  return positionals.length > 0 ? positionals : [DEFAULT_REPLAY]
}

/** The default runs must show every scene; another test replay may lack some, and the report names them. */
export function requiresEveryScene(name: string): boolean {
  return name === DEFAULT_REPLAY || name === HAND_MADE
}

// Neither default run holds a Terastallization: 994052 is a Gen 3 battle, and the hand-made battle
// keeps the frames of the module's baseline (#89).
const NOT_IN_DEFAULT_RUNS: readonly string[] = ['first-tera']

/** The scenes a run lacks that fail it: for a default run, every one but those it cannot hold. */
export function missingThatFails(name: string, missing: readonly string[]): string[] {
  if (!requiresEveryScene(name)) return []
  return missing.filter((scene) => !NOT_IN_DEFAULT_RUNS.includes(scene))
}

/** The ids of the test replays among the files of test/fixtures/replays/, in their order. */
function testReplayIds(files: readonly string[]): string[] {
  return files.flatMap((name) => /-(\d+)\.json$/.exec(name)?.[1] ?? [])
}

/** The file in test/fixtures/replays/ of the test replay with this id. */
export function replayFile(id: string, files: readonly string[]): string {
  const file = files.find((name) => name.endsWith(`-${id}.json`))
  if (file === undefined) {
    const ids = testReplayIds(files)
    throw new Error(`no test replay ${id} in test/fixtures/replays/; there are ${ids.join(', ')}`)
  }
  return file
}

/** The named streams, then every test replay not named among them (wasm:run --all, #66). */
export function withEveryTestReplay(
  names: readonly string[],
  files: readonly string[] = readdirSync(REPLAY_DIR),
): string[] {
  return [...names, ...testReplayIds(files).filter((id) => !names.includes(id))]
}

/** A stream to play and what its run must show; the WebAssembly harness plays the same list. */
export interface StreamPlan {
  name: string
  /** The stream's bytes, or undefined for the slot as the build leaves it. */
  stream: Uint8Array | undefined
  scenes: Scene[]
  /** The scenes the stream lacks. */
  missing: string[]
  expect: Expected
  /** The stream's ops by name, in order, for the op frame log (#71). */
  ops: string[]
}

/** A stream plan as the shot tool and the module's runner play it. */
export interface ShotPlan extends StreamPlan {
  /** Hold B from this frame on to the run's end; the first frame is 1. */
  holdBFrom?: number
}

const HELD_B = `${HAND_MADE}-b`

/** The plans with hand-made-b after hand-made: B held from the first frame (#30, #68). */
export function withHeldB(plans: readonly StreamPlan[]): ShotPlan[] {
  return plans.flatMap((plan) =>
    plan.name === HAND_MADE ? [plan, { ...plan, name: HELD_B, holdBFrom: 1 }] : [plan],
  )
}

interface RunPlan extends ShotPlan {
  /** The ROM bytes, or undefined for the built ROM as it is. */
  rom: Uint8Array | undefined
}

export interface RunReport {
  name: string
  expect: Expected
  seconds: number
  status: ToolOutput['status']
  scenes: SceneVerdict[]
  missing: string[]
  problems: string[]
}

type Say = (line: string) => void

const say: Say = (line) => process.stdout.write(`rom:shots: ${line}\n`)

// src/gen3/ resolves as the page's bundler does (no file extensions, JSON imports), which plain
// Node cannot load; Vite's module runner loads it with the same resolution as the page.
async function loadShotStream(): Promise<typeof ShotStream> {
  const path = join(REPO_DIR, 'scripts', 'rom-shot-stream.ts')
  const { module } = await runnerImport<typeof ShotStream>(path, {
    configFile: false,
    logLevel: 'silent',
  })
  return module
}

function readBuiltRom(paths: BuildPaths): { rom: Uint8Array; description: SlotDescription } {
  const rom = readFileSync(join(paths.outDir, OUTPUT_NAMES.rom))
  const text = readFileSync(join(paths.outDir, OUTPUT_NAMES.slot), 'utf8')
  const description = JSON.parse(text) as SlotDescription
  const sha1 = createHash('sha1').update(rom).digest('hex')
  if (sha1 !== description.romSha1) {
    throw new Error(
      `${OUTPUT_NAMES.rom} has SHA1 ${sha1}, ${OUTPUT_NAMES.slot} describes ${description.romSha1}; run npm run rom:build`,
    )
  }
  return { rom, description }
}

// A named stream's bytes by the name of its run; send-outs names one stream per battle.
function namedStreams(shot: typeof ShotStream, name: string): [string, Uint8Array][] {
  if (name === SEND_OUTS) return shot.sendOutBytes()
  if (name === HAND_MADE) return [[name, shot.handMadeBytes()]]
  const file = join(REPLAY_DIR, replayFile(name, readdirSync(REPLAY_DIR)))
  return [[name, shot.replayBytes(JSON.parse(readFileSync(file, 'utf8')))]]
}

/**
 * The named streams, then two refusals: the empty slot (refused as EMPTY) and the hand-made
 * stream with the first unknown version (refused as VERSION).
 */
export async function planStreams(
  names: readonly string[],
  layout: ProgressLayout,
): Promise<StreamPlan[]> {
  const shot = await loadShotStream()
  const plays = names.flatMap((named) => namedStreams(shot, named))
  const opsOf = (stream: Stream) => stream.instructions.map(({ op }) => op)
  const played = plays.map(([name, bytes]): StreamPlan => {
    const stream = shot.decodeStream(bytes)
    return {
      name,
      stream: bytes,
      scenes: scenesOf(stream),
      missing: missingScenes(stream),
      expect: 'finished',
      ops: opsOf(stream),
    }
  })
  const refused = { scenes: refusalScenes(layout.refusedColour), missing: [] }
  const handMade = shot.handMadeBytes()
  return [
    ...played,
    { name: 'empty-slot', stream: undefined, ...refused, expect: 'EMPTY', ops: [] },
    {
      name: `version-${String(shot.UNKNOWN_VERSION)}`,
      stream: shot.withVersion(handMade, shot.UNKNOWN_VERSION),
      ...refused,
      expect: 'VERSION',
      ops: opsOf(shot.decodeStream(handMade)),
    },
  ]
}

async function planRuns(
  paths: BuildPaths,
  names: readonly string[],
  layout: ProgressLayout,
): Promise<RunPlan[]> {
  const plans = withHeldB(await planStreams(names, layout))
  const { rom, description } = readBuiltRom(paths)
  return plans.map((plan) => ({
    ...plan,
    rom: plan.stream === undefined ? undefined : writeReplaySlot(rom, description, plan.stream),
  }))
}

/** The frames a run wrote into its folder as PPM, by name. */
export function readFrames(dir: string): Map<string, Frame> {
  const frames = new Map<string, Frame>()
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.ppm')) frames.set(file.slice(0, -4), readPpm(readFileSync(join(dir, file))))
  }
  return frames
}

interface Context {
  paths: BuildPaths
  shotsDir: string
  tool: string
  address: number
  errors: string[]
}

function playRun(context: Context, plan: RunPlan): RunReport {
  const romPath =
    plan.rom === undefined
      ? join(context.paths.outDir, OUTPUT_NAMES.rom)
      : join(context.shotsDir, `${plan.name}.gba`)
  if (plan.rom !== undefined) writeFileSync(romPath, plan.rom)
  const frameDir = join(context.shotsDir, plan.name)
  const start = performance.now()
  const output = runTool({
    tool: context.tool,
    rom: romPath,
    address: context.address,
    frameDir,
    shots: shotArgs(plan.scenes),
    ...(plan.holdBFrom === undefined ? {} : { holdBFrom: plan.holdBFrom }),
  })
  const seconds = Math.round((performance.now() - start) / 100) / 10
  writeOpFrames(frameDir, opFrameLog({ engine: 'mgba', stream: plan.name }, output.ops, plan.ops))
  return reportRun({ plan, output, frames: readFrames(frameDir), errors: context.errors, seconds })
}

export interface PlayedRun {
  plan: StreamPlan
  output: ToolOutput
  frames: ReadonlyMap<string, Frame>
  errors: readonly string[]
  seconds: number
}

/** Checks a run's scenes on its frames and judges it. */
export function reportRun(run: PlayedRun): RunReport {
  const { plan, output } = run
  const scenes = plan.scenes.map((scene) => ({
    name: scene.name,
    ...checkShots(scene.check, run.frames),
  }))
  const { missing } = plan
  const problems = judgeRun({
    expect: plan.expect,
    output,
    scenes,
    errors: run.errors,
    missing: missingThatFails(plan.name, missing),
  })
  const { name, expect } = plan
  return { name, expect, seconds: run.seconds, status: output.status, scenes, missing, problems }
}

/** A run's lines: its verdict and status, its scenes, the scenes it lacks and its problems. */
export function sayRun(report: RunReport, say: Say): void {
  const { status } = report
  const verdict = report.problems.length === 0 ? 'passed' : 'FAILED'
  say(
    `${report.name}: ${verdict}, ${status.status} after ${String(status.frame)} frames, ${String(status.done)} of ${String(status.total)} done, ${String(report.seconds)} s`,
  )
  for (const scene of report.scenes) {
    say(`  ${scene.pass ? 'pass' : 'FAIL'} ${scene.name}: ${scene.detail}`)
  }
  for (const name of report.missing) say(`  missing ${name}: the stream has none`)
  // A failed or missing scene is listed above already.
  const listed = (line: string) => line.startsWith('scene ') || line.startsWith('missing scene ')
  for (const problem of report.problems.filter((line) => !listed(line))) say(`  ${problem}`)
}

async function runShots(names: readonly string[]): Promise<void> {
  const paths = buildPaths()
  const shotsDir = join(paths.outDir, 'shots')
  const tool = join(paths.outDir, 'shot', 'replay_shot')
  buildTool(tool)
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const context: Context = {
    paths,
    shotsDir,
    tool,
    address: progressAddress(nmOutput(join(paths.outDir, OUTPUT_NAMES.elf)), layout.size),
    errors: readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8')),
  }
  const plans = await planRuns(paths, names, layout)
  emptyInside(paths.roots, shotsDir)
  mkdirSync(shotsDir, { recursive: true })
  const reports = plans.map((plan) => playRun(context, plan))
  finishRuns(reports, shotsDir, say)
}

/** Says each run, writes report.json into the folder of the frames, and fails if a run failed. */
export function finishRuns(reports: readonly RunReport[], dir: string, say: Say): void {
  for (const report of reports) sayRun(report, say)
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(reports, null, 2)}\n`)
  const failed = reports.filter((report) => report.problems.length > 0)
  if (failed.length > 0) {
    throw new Error(
      `${String(failed.length)} of ${String(reports.length)} runs failed; frames in ${dir}`,
    )
  }
  say(`all ${String(reports.length)} runs passed; frames and report.json in ${dir}`)
}

async function main(): Promise<void> {
  await runCliAsync('rom:shots', async () => {
    await runShots(parseShotArgs(process.argv.slice(2)))
  })
}

if (import.meta.main) await main()
