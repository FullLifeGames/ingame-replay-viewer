// npm run wasm:build: the WebAssembly build of the expansion (#35). Step B1 brings the compile
// census: `--census [report.md]` compiles every C file of the tree once at -O0 and writes the
// report, build/wasm/census.json and one .err file per failure; `--census-report [report.md]`
// renders the report again from census.json. Everything it writes lies under build/wasm, apart
// from a report path named on the command line. The tree comes from `npm run rom:build`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { runCliAsync } from './rom-cli.ts'
import { REPO_DIR } from './rom-paths.ts'
import { renderCensus } from './wasm-census.ts'
import type { CensusEntry } from './wasm-census.ts'
import { runCommands } from './wasm-census-run.ts'
import type { CensusResult } from './wasm-census-run.ts'
import { checkNamedSources, compileCommands, treeSources, wasmPaths } from './wasm-compile.ts'
import type { WasmPaths } from './wasm-compile.ts'
import { loadWasmConfig } from './wasm-config.ts'
import type { WasmConfig } from './wasm-config.ts'

export interface BuildArgs {
  mode: 'census' | 'report'
  out: string
}

const USAGE = 'usage: wasm:build --census [/abs/report.md] | --census-report [/abs/report.md]'
const MODES: Record<string, BuildArgs['mode']> = {
  '--census': 'census',
  '--census-report': 'report',
}
// A file that takes longer at -O0 has a problem of its own; the census names it.
const TIMEOUT_MS = 20 * 60 * 1000

export function parseBuildArgs(args: readonly string[], outDir: string): BuildArgs {
  const [flag, out, ...rest] = args
  const mode = flag === undefined ? undefined : MODES[flag]
  if (mode === undefined || rest.length > 0 || (out !== undefined && !isAbsolute(out))) {
    throw new Error(USAGE)
  }
  return { mode, out: out ?? join(outDir, 'census.md') }
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

function heading(config: WasmConfig, seconds: number): string {
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return `Run ${date} UTC: emcc ${config.emscripten.version}, -O0, ${String(config.jobs)} jobs, every C file of the tree, excluded ones included; wall time ${String(Math.round(seconds))} s.`
}

function writeErrors(paths: WasmPaths, results: readonly CensusResult[]): void {
  const dir = join(paths.out, 'census')
  mkdirSync(dir, { recursive: true })
  for (const { entry, stderr } of results.filter((result) => !result.entry.ok)) {
    writeFileSync(join(dir, errorFileName(entry.source)), `${stderr}\n`)
  }
}

async function census(paths: WasmPaths, config: WasmConfig, out: string): Promise<void> {
  checkToolchain(paths, config)
  const sources = treeSources(paths.tree)
  checkNamedSources(config, sources)
  // The census compiles the excluded files too, so the report shows what the glue replaces.
  const commands = compileCommands({ ...config, exclude: [] }, sources, paths, { optimise: '-O0' })
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
  writeErrors(paths, results)
  const json = { heading: heading(config, (performance.now() - start) / 1000), entries }
  writeFileSync(join(paths.out, 'census.json'), `${JSON.stringify(json, null, 2)}\n`)
  report(paths, config, out)
}

function report(paths: WasmPaths, config: WasmConfig, out: string): void {
  const saved = JSON.parse(readFileSync(join(paths.out, 'census.json'), 'utf8')) as {
    heading: string
    entries: CensusEntry[]
  }
  writeFileSync(
    out,
    renderCensus(saved.entries, { excluded: config.exclude, heading: saved.heading }),
  )
  say(`report in ${out}`)
}

async function main(): Promise<void> {
  await runCliAsync('wasm:build', async () => {
    const paths = wasmPaths(REPO_DIR)
    const args = parseBuildArgs(process.argv.slice(2), paths.out)
    const config = loadWasmConfig()
    if (args.mode === 'census') await census(paths, config, args.out)
    else report(paths, config, args.out)
  })
}

if (import.meta.main) await main()
