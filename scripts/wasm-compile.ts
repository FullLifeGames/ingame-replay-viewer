// One command line per C file of the WebAssembly build (#35), as the expansion's Makefile compiles
// it (`$(CPP) $(CPPFLAGS) $< | $(PREPROC) -i -g $(ASSETS_DIR_NAME) $< charmap.txt | $(CC1)`), with
// emcc in place of the ARM tools. Every command runs in the tree; its object lands in build/wasm.
import { homedir } from 'node:os'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'

import type { WasmConfig } from './wasm-config.ts'

export interface WasmPaths {
  tree: string
  out: string
  obj: string
  shadow: string
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
    emcc: join(emsdk, 'upstream', 'emscripten', 'emcc'),
  }
}

// An exclude or a define that names no file of the tree would change nothing, silently.
export function checkNamedSources(config: WasmConfig, sources: readonly string[]): void {
  const known = new Set(sources)
  const named = [...config.exclude, ...Object.keys(config.defines)]
  const unknown = named.filter((source) => !known.has(source))
  if (unknown.length > 0) {
    throw new Error(`rom/gen3/wasm/wasm.json names no source of the tree: ${unknown.join(', ')}`)
  }
}

function objectPath(paths: WasmPaths, source: string): string {
  const object = join(paths.obj, normalize(source).replace(/\.c$/, '.o'))
  const rel = relative(paths.obj, object)
  if (isAbsolute(source) || rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`the object of ${source} would land outside ${paths.obj}`)
  }
  return object
}

function command(
  config: WasmConfig,
  paths: WasmPaths,
  source: string,
  options: CompileOptions,
): CompileCommand {
  const object = objectPath(paths, source)
  const defines = (config.defines[source] ?? []).map((define) => `-D${define}`)
  const includes = ['-iquote', paths.shadow, '-iquote', 'include', '-I', paths.shadow]
  return {
    source,
    object,
    preprocess: [paths.emcc, '-E', ...includes, ...CPPFLAGS, '-DIRV_WASM', ...defines, source],
    preproc: [PREPROC, '-i', '-g', ASSETS_DIR, source, 'charmap.txt'],
    compile: [paths.emcc, '-x', 'c', '-c', options.optimise, ...CFLAGS, '-o', object, '-'],
  }
}

export function compileCommands(
  config: WasmConfig,
  sources: readonly string[],
  paths: WasmPaths,
  options: CompileOptions = { optimise: '-O2' },
): CompileCommand[] {
  const excluded = new Set(config.exclude)
  return sources
    .filter((source) => !excluded.has(source))
    .map((source) => command(config, paths, source, options))
}
