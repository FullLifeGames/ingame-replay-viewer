// npm run rom:shots (#7, plan section 7): plays streams in the built ROM from boot to END in
// headless mGBA and checks named scenes in its frames. Three runs: the hand-made stream with every
// scene, the built ROM's empty slot (refused as EMPTY) and the hand-made stream with version 2
// (refused as VERSION). Frames, the ROMs and report.json go to build/rom/shots/. Needs a ROM
// from npm run rom:build and libmgba-dev. A replay id needs the Gen 3 game backend (B6b).
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
  progressAddress,
  readErrorNames,
  runTool,
} from './rom-shot-run.ts'
import type { Expected, SceneVerdict, ToolOutput } from './rom-shot-run.ts'
import { refusalScenes, scenesOf, shotArgs } from './rom-shot-scenes.ts'
import type { Scene } from './rom-shot-scenes.ts'
import type * as ShotStream from './rom-shot-stream.ts'

export function parseShotArgs(argv: string[]): void {
  const { positionals } = parseArgs({ args: argv, options: {}, allowPositionals: true })
  if (positionals.length > 0) {
    throw new Error(
      `a replay id ("${positionals.join(' ')}") needs the Gen 3 game backend, which is not on this branch yet; npm run rom:shots without an id plays the hand-made stream`,
    )
  }
}

interface RunPlan {
  name: string
  /** The ROM bytes, or undefined for the built ROM as it is. */
  rom: Uint8Array | undefined
  scenes: Scene[]
  expect: Expected
}

interface RunReport {
  name: string
  expect: Expected
  seconds: number
  status: ToolOutput['status']
  scenes: SceneVerdict[]
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

async function planRuns(paths: BuildPaths): Promise<RunPlan[]> {
  const shot = await loadShotStream()
  const { rom, description } = readBuiltRom(paths)
  const bytes = shot.handMadeBytes()
  const scenes = scenesOf(shot.decodeStream(bytes))
  return [
    {
      name: 'hand-made',
      rom: writeReplaySlot(rom, description, bytes),
      scenes,
      expect: 'finished',
    },
    { name: 'empty-slot', rom: undefined, scenes: refusalScenes(), expect: 'EMPTY' },
    {
      name: 'version-2',
      rom: writeReplaySlot(rom, description, shot.withVersion(bytes, 2)),
      scenes: refusalScenes(),
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
  const problems = judgeRun({ expect: plan.expect, output, scenes, errors: context.errors })
  return { name: plan.name, expect: plan.expect, seconds, status: output.status, scenes, problems }
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
  // A failed scene is listed above already.
  for (const problem of report.problems.filter((line) => !line.startsWith('scene '))) {
    say(`  ${problem}`)
  }
}

async function runShots(): Promise<void> {
  const paths = buildPaths()
  const shotsDir = join(paths.outDir, 'shots')
  const tool = join(paths.outDir, 'shot', 'replay_shot')
  buildTool(tool)
  const context: Context = {
    paths,
    shotsDir,
    tool,
    address: progressAddress(nmOutput(join(paths.outDir, OUTPUT_NAMES.elf))),
    errors: readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8')),
  }
  const plans = await planRuns(paths)
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
    parseShotArgs(process.argv.slice(2))
    await runShots()
  })
}

if (import.meta.main) await main()
