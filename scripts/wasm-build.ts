// npm run wasm:build: the WebAssembly build of the expansion (#35). `--census [report.md]` compiles
// every C file of the tree once at -O0, excluded ones included, and writes the report,
// build/wasm/census.json and one .err file per failure in build/wasm/census; `--census-report
// [report.md]` renders the report again from census.json. `--compile [report.md]` compiles what
// the build links at -O2: the files of the tree that wasm.json keeps, the patched copies of
// build/wasm/overlay and the platform files, fetched into .cache/wasm/platform and patched in
// build/wasm/platform; it writes compile.json, the .err files in build/wasm/compile and the
// report, and fails when a file fails. Everything it writes lies under build/wasm and .cache/wasm,
// apart from a report path named on the command line. The tree comes from `npm run rom:build`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { runCliAsync } from './rom-cli.ts'
import { REPO_DIR } from './rom-paths.ts'
import { renderCensus } from './wasm-census.ts'
import type { CensusEntry } from './wasm-census.ts'
import { runCommands } from './wasm-census-run.ts'
import type { CensusResult } from './wasm-census-run.ts'
import {
  checkNamedSources,
  compileCommands,
  platformCommands,
  treeSources,
  wasmPaths,
} from './wasm-compile.ts'
import type { CompileCommand, CompileOptions, WasmPaths } from './wasm-compile.ts'
import { loadWasmConfig, WASM_DIR } from './wasm-config.ts'
import type { WasmConfig } from './wasm-config.ts'
import { prepareCopies } from './wasm-overlay.ts'
import { ensurePlatform, wasmRoots } from './wasm-platform.ts'

export interface BuildArgs {
  mode: 'census' | 'report' | 'compile'
  out: string
}

const USAGE =
  'usage: wasm:build --census [/abs/report.md] | --census-report [/abs/report.md] | --compile [/abs/report.md]'
const MODES: Record<string, BuildArgs['mode']> = {
  '--census': 'census',
  '--census-report': 'report',
  '--compile': 'compile',
}
// The record each mode writes under build/wasm, and its report beside it.
const RECORDS = { census: 'census', report: 'census', compile: 'compile' } as const
// A file that takes longer at -O0 has a problem of its own; the census names it.
const TIMEOUT_MS = 20 * 60 * 1000

export function parseBuildArgs(args: readonly string[], outDir: string): BuildArgs {
  const [flag, out, ...rest] = args
  const mode = flag === undefined ? undefined : MODES[flag]
  if (mode === undefined || rest.length > 0 || (out !== undefined && !isAbsolute(out))) {
    throw new Error(USAGE)
  }
  return { mode, out: out ?? join(outDir, `${RECORDS[mode]}.md`) }
}

export function checkEmccVersion(banner: string, wanted: string): void {
  const found = /\) (\d+\.\d+\.\d+) \(/.exec(banner.split('\n')[0] ?? '')?.[1]
  if (found !== wanted) {
    throw new Error(
      `rom/gen3/wasm/wasm.json pins Emscripten ${wanted}, emcc is ${found ?? 'unknown'}`,
    )
  }
}

export const errorFileName = (source: string) => `${source.replaceAll('/', '_')}.err`

const say = (line: string) => process.stdout.write(`wasm:build: ${line}\n`)

function checkToolchain(paths: WasmPaths, config: WasmConfig): void {
  if (!existsSync(paths.emcc)) {
    throw new Error(`no emcc at ${paths.emcc}; install emsdk ${config.emscripten.version} there`)
  }
  checkEmccVersion(
    execFileSync(paths.emcc, ['--version'], { encoding: 'utf8' }),
    config.emscripten.version,
  )
  for (const made of ['tools/preproc/preproc', 'build/assets']) {
    if (!existsSync(join(paths.tree, made))) {
      throw new Error(`the tree has no ${made}; run npm run rom:build first`)
    }
  }
}

const SCOPE = {
  census: 'every C file of the tree, excluded ones included',
  compile: 'the files the build keeps, the overlay copies and the platform files',
}

function heading(config: WasmConfig, mode: Run, seconds: number): string {
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const optimise = mode === 'census' ? '-O0' : '-O2'
  return `Run ${date} UTC: emcc ${config.emscripten.version}, ${optimise}, ${String(config.jobs)} jobs, ${SCOPE[mode]}; wall time ${String(Math.round(seconds))} s.`
}

type Run = 'census' | 'compile'

function writeErrors(paths: WasmPaths, mode: Run, results: readonly CensusResult[]): void {
  const dir = join(paths.out, mode)
  mkdirSync(dir, { recursive: true })
  for (const { entry, stderr } of results.filter((result) => !result.entry.ok)) {
    writeFileSync(join(dir, errorFileName(entry.source)), `${stderr}\n`)
  }
}

async function runAll(
  paths: WasmPaths,
  config: WasmConfig,
  mode: Run,
  commands: CompileCommand[],
): Promise<CensusEntry[]> {
  const start = performance.now()
  const results = await runCommands(commands, {
    cwd: paths.tree,
    jobs: config.jobs,
    timeoutMs: TIMEOUT_MS,
    onResult: ({ entry }, done) => {
      const mb = Math.round(entry.rssKb / 1024)
      say(
        `[${String(done)}/${String(commands.length)}] ${entry.ok ? 'pass' : 'FAIL'} ${entry.source} ${entry.seconds.toFixed(1)} s ${String(mb)} MB`,
      )
    },
  })
  const entries = results.map((result) => result.entry)
  mkdirSync(paths.out, { recursive: true })
  writeErrors(paths, mode, results)
  const json = { heading: heading(config, mode, (performance.now() - start) / 1000), entries }
  writeFileSync(join(paths.out, `${mode}.json`), `${JSON.stringify(json, null, 2)}\n`)
  return entries
}

async function census(paths: WasmPaths, config: WasmConfig, out: string): Promise<void> {
  checkToolchain(paths, config)
  const sources = treeSources(paths.tree)
  checkNamedSources(config, sources)
  // The census compiles the excluded files too, so the report shows what the glue replaces.
  const commands = compileCommands({ ...config, exclude: [] }, sources, paths, { optimise: '-O0' })
  await runAll(paths, config, 'census', commands)
  report(paths, config, 'census', out)
}

// The patched copies: upstream files under build/wasm/overlay, platform files under
// build/wasm/platform. Returns the overlay's C files, which compile from their copies.
function prepare(paths: WasmPaths, config: WasmConfig): string[] {
  const roots = wasmRoots(REPO_DIR)
  ensurePlatform(roots.platform, config.platform)
  const overlay = prepareCopies({
    ...{ from: paths.tree, to: paths.overlay, roots, files: 'patched' },
    patches: join(WASM_DIR, 'patches'),
  })
  const platform = prepareCopies({
    ...{ from: roots.platform, to: paths.platform, roots, files: config.platform.files },
    patches: join(WASM_DIR, 'platform-patches'),
  })
  say(`${String(overlay.length)} overlay copies, ${String(platform.length)} platform files`)
  return overlay.filter((file) => file.startsWith('src/') && file.endsWith('.c'))
}

async function compile(paths: WasmPaths, config: WasmConfig, out: string): Promise<void> {
  checkToolchain(paths, config)
  const sources = treeSources(paths.tree)
  checkNamedSources(config, sources)
  const options: CompileOptions = { optimise: '-O2', overlay: prepare(paths, config) }
  const commands = [
    ...compileCommands(config, sources, paths, options),
    ...platformCommands(config, paths, options),
  ]
  const entries = await runAll(paths, config, 'compile', commands)
  report(paths, config, 'compile', out)
  const failed = entries.filter((entry) => !entry.ok).map((entry) => entry.source)
  if (failed.length > 0)
    throw new Error(`${String(failed.length)} files failed: ${failed.join(', ')}`)
}

function report(paths: WasmPaths, config: WasmConfig, mode: Run, out: string): void {
  const saved = JSON.parse(readFileSync(join(paths.out, `${mode}.json`), 'utf8')) as {
    heading: string
    entries: CensusEntry[]
  }
  const excluded = mode === 'census' ? config.exclude : []
  writeFileSync(out, renderCensus(saved.entries, { excluded, heading: saved.heading }))
  say(`report in ${out}`)
}

async function main(): Promise<void> {
  await runCliAsync('wasm:build', async () => {
    const paths = wasmPaths(REPO_DIR)
    const args = parseBuildArgs(process.argv.slice(2), paths.out)
    const config = loadWasmConfig()
    if (args.mode === 'census') await census(paths, config, args.out)
    else if (args.mode === 'compile') await compile(paths, config, args.out)
    else report(paths, config, 'census', args.out)
  })
}

if (import.meta.main) await main()
