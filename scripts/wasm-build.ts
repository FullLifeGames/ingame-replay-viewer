// npm run wasm:build: the WebAssembly build of the expansion (#35). `--census [report.md]` compiles
// every C file of the tree once at -O0, excluded ones included, and writes the report,
// build/wasm/census.json and one .err file per failure in build/wasm/census; `--census-report
// [report.md]` renders the report again from census.json. `--compile [report.md]` compiles what
// the build links at -O2: the files of the tree that wasm.json keeps and the patched copies of
// build/wasm/overlay, then the glue of rom/gen3/wasm/src and our platform layer of
// rom/gen3/wasm/layer; it writes compile.json, glue.json,
// the .err files in build/wasm/compile and the report, and fails when a file fails. `--link
// [report.md]` compiles the glue again and links it with the objects of compile.json and build/wasm/asm (npm run wasm:convert) into
// build/wasm/irv-emerald.js and irv-emerald.wasm, then writes the patch from the dump to the module
// (irv-emerald-wasm.bps); `--patch [report.md]` writes that patch alone. `--sanitize shift` beside
// `--compile` or `--link` builds a module with clang's shift check (#44) under build/wasm/sanitize,
// with no patch, and leaves the normal outputs alone. Everything it writes lies under build/wasm,
// apart from a report path named on the command line. The tree comes from `npm run rom:build`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { runCliAsync } from './rom-cli.ts'
import { loadBuildConfig } from './rom-config.ts'
import { REPO_DIR } from './rom-paths.ts'
import { readPreflightInput } from './rom-preflight.ts'
import { renderCensus } from './wasm-census.ts'
import type { CensusEntry } from './wasm-census.ts'
import { runCommands } from './wasm-census-run.ts'
import type { CensusResult } from './wasm-census-run.ts'
import {
  checkNamedSources,
  compileCommands,
  glueCommands,
  parseSanitizer,
  sanitizedDir,
  sanitizedPaths,
  treeSources,
  wasmPaths,
  wasmRoots,
} from './wasm-compile.ts'
import type { CompileCommand, CompileOptions, Sanitizer, WasmPaths } from './wasm-compile.ts'
import { loadWasmConfig, WASM_DIR } from './wasm-config.ts'
import type { WasmConfig } from './wasm-config.ts'
import { asmObjects, compiledObjects, glueSources, linkCommand, LINK_OUTPUTS } from './wasm-link.ts'
import type { CompileRecordEntry } from './wasm-link.ts'
import { prepareCopies } from './wasm-overlay.ts'
import { writeModulePatch } from './wasm-outputs.ts'

export interface BuildArgs {
  mode: 'census' | 'report' | 'compile' | 'link' | 'patch'
  out: string
  sanitize?: Sanitizer | undefined
}

const USAGE =
  'usage: wasm:build --census [/abs/report.md] | --census-report [/abs/report.md] | --compile [/abs/report.md] | --link [/abs/report.md] | --patch [/abs/report.md], --compile and --link with --sanitize shift'
const MODES: Record<string, BuildArgs['mode']> = {
  '--census': 'census',
  '--census-report': 'report',
  '--compile': 'compile',
  '--link': 'link',
  '--patch': 'patch',
}
// The record each mode writes under build/wasm, and its report beside it.
const RECORDS = {
  census: 'census',
  report: 'census',
  compile: 'compile',
  link: 'link',
  patch: 'patch',
} as const
// A file that takes longer at -O0 has a problem of its own; the census names it.
const TIMEOUT_MS = 20 * 60 * 1000

const SANITIZED_MODES: readonly BuildArgs['mode'][] = ['compile', 'link']

// `--sanitize <check>` may stand anywhere; the rest keeps its order.
function takeSanitize(args: readonly string[]): { sanitize?: Sanitizer; rest: string[] } {
  const at = args.indexOf('--sanitize')
  if (at < 0) return { rest: [...args] }
  return { sanitize: parseSanitizer(args[at + 1]), rest: args.toSpliced(at, 2) }
}

export function parseBuildArgs(args: readonly string[], outDir: string): BuildArgs {
  const { sanitize, rest } = takeSanitize(args)
  const [flag, out, ...more] = rest
  const mode = flag === undefined ? undefined : MODES[flag]
  if (mode === undefined || more.length > 0 || (out !== undefined && !isAbsolute(out))) {
    throw new Error(USAGE)
  }
  if (sanitize !== undefined && !SANITIZED_MODES.includes(mode)) throw new Error(USAGE)
  const dir = sanitize === undefined ? outDir : sanitizedDir(outDir)
  return { mode, out: out ?? join(dir, `${RECORDS[mode]}.md`), sanitize }
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
  compile: 'the files the build keeps and the overlay copies',
  glue: 'the glue of rom/gen3/wasm/src',
}

function heading(config: WasmConfig, mode: Run, seconds: number): string {
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const optimise = mode === 'census' ? '-O0' : '-O2'
  return `Run ${date} UTC: emcc ${config.emscripten.version}, ${optimise}, ${String(config.jobs)} jobs, ${SCOPE[mode]}; wall time ${String(Math.round(seconds))} s.`
}

type Run = 'census' | 'compile' | 'glue'

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

// The patched copies of upstream files under build/wasm/overlay. Returns their C files, which
// compile from their copies.
function prepare(paths: WasmPaths): string[] {
  const overlay = prepareCopies({
    from: paths.tree,
    to: paths.overlay,
    patches: join(WASM_DIR, 'patches'),
    roots: wasmRoots(REPO_DIR),
  })
  say(`${String(overlay.length)} overlay copies`)
  return overlay.filter((file) => file.startsWith('src/') && file.endsWith('.c'))
}

async function compile(paths: WasmPaths, config: WasmConfig, args: BuildArgs): Promise<void> {
  checkToolchain(paths, config)
  const sources = treeSources(paths.tree)
  checkNamedSources(config, sources)
  const { sanitize } = args
  const options: CompileOptions = { optimise: '-O2', overlay: prepare(paths), sanitize }
  const commands = compileCommands(config, sources, paths, options)
  const entries = await runAll(paths, config, 'compile', commands)
  report(paths, config, 'compile', args.out)
  failIfAny(entries)
  // wasm:convert reads the glue's function types too, from the objects glue.json records.
  const glue = glueCommands(paths, glueSources(), { optimise: '-O2', sanitize })
  failIfAny(await runAll(paths, config, 'glue', glue))
}

function failIfAny(entries: readonly CensusEntry[]): void {
  const failed = entries.filter((entry) => !entry.ok).map((entry) => entry.source)
  if (failed.length > 0)
    throw new Error(`${String(failed.length)} files failed: ${failed.join(', ')}`)
}

// The glue compiles at -O2 like the rest, and so does the link (fix step 6): every scene passes,
// the module is 2.4 MB smaller, the link peaks at 271 MB and takes 20 s against 5-9 s at -O0.
async function link(paths: WasmPaths, config: WasmConfig, args: BuildArgs): Promise<void> {
  checkToolchain(paths, config)
  const record = JSON.parse(readFileSync(join(paths.out, 'compile.json'), 'utf8')) as {
    entries: CompileRecordEntry[]
  }
  const { sanitize } = args
  const glue = glueCommands(paths, glueSources(), { optimise: '-O2', sanitize })
  failIfAny(await runAll(paths, config, 'glue', glue))
  const objects = [
    ...compiledObjects(record.entries, paths),
    ...glue.map((command) => command.object),
    ...asmObjects(paths.asm),
  ]
  const argv = linkCommand(paths, objects, '-O2', sanitize)
  say(`linking ${String(objects.length)} objects`)
  const start = performance.now()
  execFileSync(argv[0] as string, argv.slice(1), { cwd: paths.out, stdio: 'inherit' })
  const seconds = Math.round((performance.now() - start) / 1000)
  const sizes = Object.values(LINK_OUTPUTS).map(
    (name) => `${name} ${String(statSync(join(paths.out, name)).size)} B`,
  )
  const text = `Link: ${String(objects.length)} objects, ${String(seconds)} s; ${sizes.join(', ')}.\n`
  // A sanitized module only lists shift sites (#44); no page loads it, so it gets no patch.
  const tail = sanitize === undefined ? patch(paths) : 'Patch: none for a sanitized module.'
  writeFileSync(args.out, `${text}${tail}\n`)
  say(text.trim())
}

// The patch from the dump, found by the build's rule, to the module (plan D5 (c)).
function patch(paths: WasmPaths): string {
  const { sha1 } = loadBuildConfig().baseRom
  const line = writeModulePatch(paths.out, {
    path: readPreflightInput(process.env, sha1).baseRomPath,
    sha1,
  })
  say(line)
  return `Patch: ${line}.`
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
    const normal = wasmPaths(REPO_DIR)
    const args = parseBuildArgs(process.argv.slice(2), normal.out)
    const paths = args.sanitize === undefined ? normal : sanitizedPaths(normal)
    const config = loadWasmConfig()
    if (args.mode === 'census') await census(paths, config, args.out)
    else if (args.mode === 'compile') await compile(paths, config, args)
    else if (args.mode === 'link') await link(paths, config, args)
    else if (args.mode === 'patch') writeFileSync(args.out, `${patch(paths)}\n`)
    else report(paths, config, 'census', args.out)
  })
}

if (import.meta.main) await main()
