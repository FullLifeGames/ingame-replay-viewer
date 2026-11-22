// One command line per C file of the WebAssembly build (#35), as the expansion's Makefile compiles
// it (`$(CPP) $(CPPFLAGS) $< | $(PREPROC) -i -g $(ASSETS_DIR_NAME) $< charmap.txt | $(CC1)`), with
// emcc in place of the ARM tools. Every command runs in the tree; its object lands in build/wasm.
import { readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, normalize, relative, sep } from 'node:path'

import type { RomRoots } from './rom-paths.ts'
import type { WasmConfig } from './wasm-config.ts'
import { LAYER_DIR } from './wasm-layer.ts'

export interface WasmPaths {
  tree: string
  out: string
  obj: string
  shadow: string
  // Patched copies of upstream files, from rom/gen3/wasm/patches.
  overlay: string
  emcc: string
}

export interface CompileCommand {
  source: string
  object: string
  preprocess: string[]
  preproc: string[]
  compile: string[]
}

export interface CompileOptions {
  optimise: '-O0' | '-O2'
  // Sources of the tree that compile from their patched copy under build/wasm/overlay.
  overlay?: readonly string[]
}

// One file to compile: its name in the census, where cpp reads it, and what it adds.
interface Unit {
  source: string
  input: string
  object: string
  defines: readonly string[]
  flags: readonly string[]
  // Quote dirs searched after the tree's include.
  after: readonly string[]
}

// The Makefile's CPPFLAGS with TEST=0 and GAME_VERSION=EMERALD, plus our own marker.
const CPPFLAGS = ['-Wno-trigraphs', '-DMODERN=1', '-DTESTING=0', '-DEMERALD', '-std=gnu17']
// The Makefile's CFLAGS without the ARM target flags and without -Werror: clang's own errors
// (incompatible function pointers, implicit declarations) are what the census must see.
const CFLAGS = ['-std=gnu17', '-Wall', '-Wno-strict-aliasing', '-Wno-pointer-to-int-cast']
const ASSETS_DIR = 'build/assets'
const PREPROC = 'tools/preproc/preproc'

export function wasmPaths(
  repoDir: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): WasmPaths {
  const emsdk = env.EMSDK ?? join(home, 'tools', 'emsdk')
  const out = join(repoDir, 'build', 'wasm')
  return {
    tree: join(repoDir, '.cache', 'rom', 'expansion'),
    out,
    obj: join(out, 'obj'),
    shadow: join(repoDir, 'rom', 'gen3', 'wasm', 'include'),
    overlay: join(out, 'overlay'),
    emcc: join(emsdk, 'upstream', 'emscripten', 'emcc'),
  }
}

// The folders the build may delete inside: the delete guard of rom-paths.ts takes them as it takes
// the ROM build's.
export function wasmRoots(repoDir: string): RomRoots {
  const repo = realpathSync(repoDir)
  return { cache: join(repo, '.cache', 'wasm'), out: join(repo, 'build', 'wasm') }
}

// An exclude or a define that names no file of the tree would change nothing, silently.
export function checkNamedSources(config: WasmConfig, sources: readonly string[]): void {
  const known = new Set(sources)
  const named = [...config.exclude, ...Object.keys(config.defines), ...Object.keys(config.flags)]
  const unknown = named.filter((source) => !known.has(source))
  if (unknown.length > 0) {
    throw new Error(`rom/gen3/wasm/wasm.json names no source of the tree: ${unknown.join(', ')}`)
  }
}

export function objectPath(paths: WasmPaths, source: string): string {
  const object = join(paths.obj, normalize(source).replace(/\.c$/, '.o'))
  const rel = relative(paths.obj, object)
  if (isAbsolute(source) || rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`the object of ${source} would land outside ${paths.obj}`)
  }
  return object
}

function command(paths: WasmPaths, unit: Unit, options: CompileOptions): CompileCommand {
  const after = unit.after.flatMap((dir) => ['-iquote', dir])
  const quoteDirs = ['-iquote', paths.shadow, '-iquote', join(paths.overlay, 'include')]
  const includes = [...quoteDirs, '-iquote', 'include', ...after, '-I', paths.shadow]
  const defines = unit.defines.map((define) => `-D${define}`)
  return {
    source: unit.source,
    object: unit.object,
    preprocess: [paths.emcc, '-E', ...includes, ...CPPFLAGS, '-DIRV_WASM', ...defines, unit.input],
    preproc: [PREPROC, '-i', '-g', ASSETS_DIR, unit.input, 'charmap.txt'],
    compile: [
      paths.emcc,
      '-x',
      'c',
      '-c',
      options.optimise,
      ...CFLAGS,
      ...unit.flags,
      '-o',
      unit.object,
      '-',
    ],
  }
}

export function compileCommands(
  config: WasmConfig,
  sources: readonly string[],
  paths: WasmPaths,
  options: CompileOptions = { optimise: '-O2' },
): CompileCommand[] {
  const excluded = new Set(config.exclude)
  const kept = sources.filter((source) => !excluded.has(source))
  const overlay = new Set(options.overlay ?? [])
  const missing = [...overlay].filter((source) => !kept.includes(source))
  if (missing.length > 0) {
    throw new Error(
      `an overlay patch changes a file the build does not compile: ${missing.join(', ')}`,
    )
  }
  return kept.map((source) => {
    const unit = {
      source,
      input: overlay.has(source) ? join(paths.overlay, source) : source,
      object: objectPath(paths, source),
      defines: config.defines[source] ?? [],
      flags: config.flags[source] ?? [],
      after: [],
    }
    return command(paths, unit, options)
  })
}

// The glue's own C files (rom/gen3/wasm/src) and our platform layer's (rom/gen3/wasm/layer),
// given as absolute paths. They compile as files of the game; the layer's headers come after the
// tree's include.
export function glueCommands(
  paths: WasmPaths,
  sources: readonly string[],
  options: CompileOptions = { optimise: '-O2' },
): CompileCommand[] {
  return sources.map((input) => {
    const source = `glue/${basename(input)}`
    const unit = {
      source,
      input,
      object: objectPath(paths, source),
      defines: [],
      flags: [],
      after: [LAYER_DIR],
    }
    return command(paths, unit, options)
  })
}

const quote = (arg: string) => `'${arg.replaceAll("'", "'\\''")}'`

// For `bash -o pipefail -c`, so a failure in any of the three stages fails the file.
export function pipelineScript(command: CompileCommand): string {
  return [command.preprocess, command.preproc, command.compile]
    .map((argv) => argv.map(quote).join(' '))
    .join(' | ')
}

// The Makefile's C_SRCS: src/*.c, src/*/*.c and src/*/*/*.c, without the .inc.c files.
export function treeSources(tree: string): string[] {
  return readdirSync(join(tree, 'src'), { recursive: true, encoding: 'utf8' })
    .map((name) => `src/${name.split(sep).join('/')}`)
    .filter((name) => name.endsWith('.c') && !name.endsWith('.inc.c'))
    .filter((name) => name.split('/').length <= 4)
    .sort()
}
