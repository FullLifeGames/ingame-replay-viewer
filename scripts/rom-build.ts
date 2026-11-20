// npm run rom:build [-- --clean] and npm run rom:clean [-- --all] (plan §6). A thin CLI over the
// tested modules: preflight, the pinned tree with our changes, make, then the outputs in build/rom/.
// A heavy check on devbox: run it alone and in the background (AGENTS.md).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { loadBuildConfig, ROM_DIR } from './rom-config.ts'
import type { BuildConfig } from './rom-config.ts'
import { packageVersions, readRomUsage, runMake, toolVersions } from './rom-make.ts'
import { makeOutputs, OUTPUT_NAMES, writeOutputs } from './rom-outputs.ts'
import type { RomOutputs } from './rom-outputs.ts'
import { APT_PACKAGES, preflightProblems, readPreflightInput } from './rom-preflight.ts'
import { loadSlotLayout } from './rom-slot.ts'
import { cleanTree, ensureCheckout, prepareTree } from './rom-upstream.ts'
import type { TreeResult } from './rom-upstream.ts'

export const REPO_DIR = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

export interface BuildArgs {
  clean: boolean
  cleanOnly: boolean
  all: boolean
}

export interface BuildPaths {
  outDir: string
  tree: string
  stampPath: string
}

// What upstream's plain `make` writes at the top of the tree (Makefile:29, 99-107).
const MADE = { rom: 'pokeemerald.gba', elf: 'pokeemerald.elf', map: 'pokeemerald.map' }

const TOOLS = ['arm-none-eabi-gcc', 'arm-none-eabi-as', 'arm-none-eabi-ld', 'make', 'python3']

export function parseBuildArgs(argv: string[]): BuildArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      clean: { type: 'boolean', default: false },
      'clean-only': { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
  if (values.all && !values['clean-only']) {
    throw new Error('--all deletes the upstream tree and goes only with npm run rom:clean -- --all')
  }
  return { clean: values.clean, cleanOnly: values['clean-only'], all: values.all }
}

export function buildPaths(env: NodeJS.ProcessEnv): BuildPaths {
  const cacheDir = env.IRV_ROM_CACHE ?? join(REPO_DIR, '.cache', 'rom')
  return {
    outDir: join(REPO_DIR, 'build', 'rom'),
    tree: join(cacheDir, 'expansion'),
    stampPath: join(cacheDir, 'applied.json'),
  }
}

const say = (line: string) => process.stdout.write(`rom:build: ${line}\n`)

const sha256File = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

// --all deletes only what the build made in the cache folder, never the folder IRV_ROM_CACHE names.
function cleanOutputs(paths: BuildPaths, config: BuildConfig, all: boolean): void {
  rmSync(paths.outDir, { recursive: true, force: true })
  rmSync(paths.stampPath, { force: true })
  if (all) {
    rmSync(paths.tree, { recursive: true, force: true })
    say(`removed ${paths.outDir} and ${paths.tree}`)
    return
  }
  try {
    cleanTree(paths.tree, config.upstream)
  } catch (error) {
    throw new Error(`${paths.tree} stays as it is; npm run rom:clean -- --all removes it`, {
      cause: error,
    })
  }
  say(`removed ${paths.outDir} and the build products in ${paths.tree}`)
}

function nmOutput(elfPath: string): string {
  const result = spawnSync('arm-none-eabi-nm', ['-P', '-t', 'x', elfPath], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`arm-none-eabi-nm failed: ${result.stderr.trim()}`)
  return result.stdout
}

function timed<T>(seconds: Record<string, number>, step: string, run: () => T): T {
  const start = performance.now()
  const result = run()
  seconds[step] = Math.round((performance.now() - start) / 100) / 10
  say(`${step} done in ${String(seconds[step])} s`)
  return result
}

interface BuildRecord {
  config: BuildConfig
  tree: TreeResult
  outputs: RomOutputs
  makeLog: string
  seconds: Record<string, number>
}

function buildInfo(record: BuildRecord): unknown {
  const { config, tree, outputs, seconds } = record
  return {
    upstream: config.upstream,
    series: tree.patches.map((name) => ({
      name,
      sha256: sha256File(join(ROM_DIR, 'patches', name)),
    })),
    copied: tree.copied,
    make: { jobs: config.make.jobs, flavour: 'plain make' },
    toolchain: {
      tools: toolVersions(TOOLS, process.env),
      packages: packageVersions(APT_PACKAGES, process.env),
      node: process.version,
    },
    romUsage: readRomUsage(readFileSync(record.makeLog, 'utf8')) ?? 'not in make.log',
    romSize: outputs.description.romSize,
    patchSize: outputs.patch.length,
    slotOffset: outputs.description.offset,
    sha1: outputs.sha1,
    seconds,
  }
}

function collect(paths: BuildPaths, baseRomPath: string): RomOutputs {
  for (const kind of ['rom', 'elf', 'map'] as const) {
    copyFileSync(join(paths.tree, MADE[kind]), join(paths.outDir, OUTPUT_NAMES[kind]))
  }
  const outputs = makeOutputs({
    rom: readFileSync(join(paths.outDir, OUTPUT_NAMES.rom)),
    base: readFileSync(baseRomPath),
    nmOutput: nmOutput(join(paths.outDir, OUTPUT_NAMES.elf)),
    layout: loadSlotLayout(),
  })
  writeOutputs(paths.outDir, outputs)
  return outputs
}

function build(paths: BuildPaths, config: BuildConfig, clean: boolean): void {
  const input = readPreflightInput(process.env, config.baseRom.sha1)
  const problems = preflightProblems(input)
  if (problems.length > 0) throw new Error(problems.join('\n'))
  rmSync(paths.outDir, { recursive: true, force: true })
  mkdirSync(paths.outDir, { recursive: true })
  const seconds: Record<string, number> = {}
  const makeLog = join(paths.outDir, OUTPUT_NAMES.makeLog)
  timed(seconds, 'checkout', () => {
    ensureCheckout(paths.tree, config.upstream)
  })
  const options = { tree: paths.tree, romDir: ROM_DIR, pin: config.upstream, clean }
  const tree = timed(seconds, 'prepare', () =>
    prepareTree({ ...options, stampPath: paths.stampPath }),
  )
  timed(seconds, 'make', () => {
    runMake({ tree: paths.tree, jobs: config.make.jobs, logPath: makeLog, env: process.env })
  })
  const outputs = timed(seconds, 'outputs', () => collect(paths, input.baseRomPath))
  const info = buildInfo({ config, tree, outputs, makeLog, seconds })
  writeFileSync(join(paths.outDir, OUTPUT_NAMES.info), `${JSON.stringify(info, null, 2)}\n`)
  say(`ROM SHA1 ${outputs.sha1.rom}, replay slot at 0x${outputs.description.offset.toString(16)}`)
  say(`patch ${String(outputs.patch.length)} bytes, round trip passed; outputs in ${paths.outDir}`)
}

function main(): void {
  try {
    const args = parseBuildArgs(process.argv.slice(2))
    const paths = buildPaths(process.env)
    const config = loadBuildConfig()
    if (args.cleanOnly) cleanOutputs(paths, config, args.all)
    else build(paths, config, args.clean)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    process.stderr.write(`rom:build: ${message}\n${cause === '' ? '' : `${cause}\n`}`)
    process.exitCode = 1
  }
}

if (import.meta.main) main()
