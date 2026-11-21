// npm run rom:shots [-- <name>...] (#7, plan section 7): plays streams in the built ROM from boot
// to END in headless mGBA and checks named scenes in its frames. A name is a test replay id (its
// stream comes from the Gen 3 game backend; 994052 when no name is given, S2a D5) or hand-made (a
// short battle written with the stream encoder). Two refusal runs follow: the built ROM's empty
// slot (refused as EMPTY) and the hand-made stream with version 2 (refused as VERSION). Frames, the
// ROMs and report.json go to build/rom/shots/. Needs a ROM from npm run rom:build and libmgba-dev.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { runnerImport } from 'vite'

import type { SlotDescription } from '../src/patch/slot.ts'
import { writeReplaySlot } from '../src/patch/slot.ts'
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

const HAND_MADE = 'hand-made'
const DEFAULT_REPLAY = '994052'
const REPLAY_DIR = join(REPO_DIR, 'test', 'fixtures', 'replays')

/** The streams to play, by name: test replay ids and hand-made. */
export function parseShotArgs(argv: string[]): string[] {
  const { positionals } = parseArgs({ args: argv, options: {}, allowPositionals: true })
  positionals.forEach((name, i) => {
    if (name !== HAND_MADE && !/^\d+$/.test(name)) {
      throw new Error(
        `"${name}" is neither a test replay id (its digits, such as ${DEFAULT_REPLAY}) nor ${HAND_MADE}`,
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

/** The file in test/fixtures/replays/ of the test replay with this id. */
export function replayFile(id: string, files: readonly string[]): string {
  const file = files.find((name) => name.endsWith(`-${id}.json`))
  if (file === undefined) {
    const ids = files.flatMap((name) => /-(\d+)\.json$/.exec(name)?.[1] ?? [])
    throw new Error(`no test replay ${id} in test/fixtures/replays/; there are ${ids.join(', ')}`)
  }
  return file
}

interface RunPlan {
  name: string
  /** The ROM bytes, or undefined for the built ROM as it is. */
  rom: Uint8Array | undefined
  scenes: Scene[]
  /** The scenes the stream lacks. */
  missing: string[]
  expect: Expected
}

interface RunReport {
  name: string
  expect: Expected
  seconds: number
  status: ToolOutput['status']
  scenes: SceneVerdict[]
  missing: string[]
  problems: string[]
}

const say = (line: string) => process.stdout.write(`rom:shots: ${line}\n`)

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

function streamBytes(shot: typeof ShotStream, name: string): Uint8Array {
  if (name === HAND_MADE) return shot.handMadeBytes()
  const file = join(REPLAY_DIR, replayFile(name, readdirSync(REPLAY_DIR)))
  return shot.replayBytes(JSON.parse(readFileSync(file, 'utf8')))
}

async function planRuns(
  paths: BuildPaths,
  names: readonly string[],
  layout: ProgressLayout,
): Promise<RunPlan[]> {
  const shot = await loadShotStream()
  const { rom, description } = readBuiltRom(paths)
  const plays = names.map((name): RunPlan => {
    const bytes = streamBytes(shot, name)
    const stream = shot.decodeStream(bytes)
    return {
      name,
      rom: writeReplaySlot(rom, description, bytes),
      scenes: scenesOf(stream),
      missing: missingScenes(stream),
      expect: 'finished',
    }
  })
  const refused = refusalScenes(layout.refusedColour)
  return [
    ...plays,
    { name: 'empty-slot', rom: undefined, scenes: refused, missing: [], expect: 'EMPTY' },
    {
      name: 'version-2',
      rom: writeReplaySlot(rom, description, shot.withVersion(shot.handMadeBytes(), 2)),
      scenes: refused,
      missing: [],
      expect: 'VERSION',
    },
  ]
}

function readFrames(dir: string): Map<string, Frame> {
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
  })
  const seconds = Math.round((performance.now() - start) / 100) / 10
  const frames = readFrames(frameDir)
  const scenes = plan.scenes.map((scene) => ({
    name: scene.name,
    ...checkShots(scene.check, frames),
  }))
  const { missing } = plan
  const problems = judgeRun({
    expect: plan.expect,
    output,
    scenes,
    errors: context.errors,
    missing: requiresEveryScene(plan.name) ? missing : [],
  })
  const { name, expect } = plan
  return { name, expect, seconds, status: output.status, scenes, missing, problems }
}

function sayRun(report: RunReport): void {
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
  reports.forEach(sayRun)
  writeFileSync(join(shotsDir, 'report.json'), `${JSON.stringify(reports, null, 2)}\n`)
  const failed = reports.filter((report) => report.problems.length > 0)
  if (failed.length > 0) {
    throw new Error(
      `${String(failed.length)} of ${String(reports.length)} runs failed; frames in ${shotsDir}`,
    )
  }
  say(`all ${String(reports.length)} runs passed; frames and report.json in ${shotsDir}`)
}

async function main(): Promise<void> {
  await runCliAsync('rom:shots', async () => {
    await runShots(parseShotArgs(process.argv.slice(2)))
  })
}

if (import.meta.main) await main()
