// The link of the WebAssembly build (#35): the objects it takes, emcc's flags and the outputs. It
// takes the objects that build/wasm/compile.json records, the glue's objects and the converted data
// objects of build/wasm/asm. It never globs build/wasm/obj, which still holds census objects of
// excluded files. Its outputs land in build/wasm only.
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { objectPath } from './wasm-compile.ts'
import type { CompileOptions, WasmPaths } from './wasm-compile.ts'
import { WASM_DIR } from './wasm-config.ts'

// Our C files of the build: the frame, the stubs, the replacements and the memory check.
const GLUE_DIR = join(WASM_DIR, 'src')
export const LINK_OUTPUTS = { js: 'irv-emerald.js', wasm: 'irv-emerald.wasm' } as const
// What the host calls: the game's entry, and where the slot and the replay progress lie.
const LINK_EXPORTS = ['AgbMain', 'IrvWasm_Slot', 'IrvWasm_Progress'] as const

export interface LinkSettings {
  globalBase: number
  initialMemory: number
  stackSize: number
}

// GBA addresses map one to one into linear memory (plan D2). Static data starts where the
// cartridge does, and the stack and the heap follow it, so none of them lies on EWRAM, IWRAM, the
// IO registers, the palette, VRAM or OAM. The memory is fixed: no growth, so no view goes stale.
export function linkSettings(): LinkSettings {
  return { globalBase: 0x08000000, initialMemory: 256 * 1024 * 1024, stackSize: 1024 * 1024 }
}

export interface CompileRecordEntry {
  source: string
  ok: boolean
}

export function compiledObjects(
  entries: readonly CompileRecordEntry[],
  paths: WasmPaths,
): string[] {
  if (entries.length === 0) throw new Error('build/wasm/compile.json records no file')
  const failed = entries.filter((entry) => !entry.ok).map((entry) => entry.source)
  if (failed.length > 0) {
    throw new Error(
      `build/wasm/compile.json records failed files: ${failed.join(', ')}; run npm run wasm:build -- --compile`,
    )
  }
  return entries.map((entry) => objectPath(paths, entry.source))
}

const sortedFiles = (dir: string, suffix: string) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => join(dir, name))

export function asmObjects(dir: string): string[] {
  const objects = sortedFiles(dir, '.o')
  if (objects.length === 0) throw new Error(`no data objects in ${dir}; run npm run wasm:convert`)
  return objects
}

export function glueSources(dir: string = GLUE_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.c'))
    .sort()
    .map((name) => join(dir, name))
}

function checkInside(out: string, objects: readonly string[]): void {
  const outside = objects.filter((object) => relative(out, object).startsWith(`..${sep}`))
  if (outside.length > 0) {
    throw new Error(`the link takes objects outside ${out}: ${outside.join(', ')}`)
  }
}

export function linkCommand(
  paths: WasmPaths,
  objects: readonly string[],
  optimise: CompileOptions['optimise'] = '-O2',
): string[] {
  checkInside(paths.out, objects)
  const { globalBase, initialMemory, stackSize } = linkSettings()
  const exports = LINK_EXPORTS.map((name) => `_${name}`).join(',')
  return [
    paths.emcc,
    optimise,
    ...objects,
    // The host instantiates, writes the stream into the slot, then calls AgbMain itself.
    '-sINVOKE_RUN=0',
    '-sMODULARIZE',
    '-sEXPORT_ES6',
    '-sENVIRONMENT=web,worker,node',
    `-sGLOBAL_BASE=${String(globalBase)}`,
    `-sINITIAL_MEMORY=${String(initialMemory)}`,
    '-sALLOW_MEMORY_GROWTH=0',
    `-sSTACK_SIZE=${String(stackSize)}`,
    // script.c breaks out of an effect analysis with setjmp and longjmp (overlay patch 0001).
    '-sSUPPORT_LONGJMP=emscripten',
    '-sERROR_ON_UNDEFINED_SYMBOLS=1',
    `-sEXPORTED_FUNCTIONS=${exports}`,
    '-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU16',
    // Function names stay in the module, so a trap's stack names the game's functions.
    '--profiling-funcs',
    '-o',
    join(paths.out, LINK_OUTPUTS.js),
  ]
}
