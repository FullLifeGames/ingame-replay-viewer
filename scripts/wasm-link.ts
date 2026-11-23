// The link of the WebAssembly build (#35): the objects it takes, emcc's flags and the outputs. It
// takes the objects that build/wasm/compile.json records, the glue's objects and the converted data
// objects of build/wasm/asm. It never globs build/wasm/obj, which still holds census objects of
// excluded files. Its outputs land in build/wasm only.
import { readdirSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

import { objectPath, sanitizeFlags } from './wasm-compile.ts'
import type { CompileOptions, Sanitizer, WasmPaths } from './wasm-compile.ts'
import { WASM_DIR } from './wasm-config.ts'
import { folderSources, LAYER_DIR } from './wasm-layer.ts'

// Our C files of the build: the frame, the stubs, the replacements and the memory check, then
// our platform layer (wasm-layer.ts).
const GLUE_DIR = join(WASM_DIR, 'src')
export const LINK_OUTPUTS = { js: 'irv-emerald.js', wasm: 'irv-emerald.wasm' } as const
/** The commands that make the link's outputs and the module patch, in order. */
export const WASM_BUILD_STEPS =
  'npm run rom:build, npm run wasm:build -- --compile, npm run wasm:convert and ' +
  'npm run wasm:build -- --link'
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

// record: the file under build/wasm the entries come from, for the errors.
export function compiledObjects(
  entries: readonly CompileRecordEntry[],
  paths: WasmPaths,
  record = 'compile.json',
): string[] {
  if (entries.length === 0) throw new Error(`build/wasm/${record} records no file`)
  const failed = entries.filter((entry) => !entry.ok).map((entry) => entry.source)
  if (failed.length > 0) {
    throw new Error(
      `build/wasm/${record} records failed files: ${failed.join(', ')}; run npm run wasm:build -- --compile`,
    )
  }
  // The borrowed platform files left the build (#43); a record from before still names them.
  const borrowed = entries.filter((entry) => entry.source.startsWith('platform/'))
  if (borrowed.length > 0) {
    throw new Error(
      `build/wasm/${record} records platform files, which no longer build: ${borrowed.map((entry) => entry.source).join(', ')}; run npm run wasm:build -- --compile`,
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

// The glue and our platform layer compile alike, and their objects share build/wasm/obj/glue.
export function glueSources(dirs: readonly string[] = [GLUE_DIR, LAYER_DIR]): string[] {
  const sources = dirs.flatMap((dir) => folderSources(dir))
  const names = sources.map((source) => basename(source))
  const twice = names.filter((name, i) => names.indexOf(name) !== i)
  if (twice.length > 0) {
    throw new Error(
      `${twice.join(', ')} named twice in ${dirs.join(' and ')}: one object would hide the other`,
    )
  }
  return sources
}

// The objects lie under the build's outputs, or among the data objects, which a sanitized build
// shares with the normal one.
function checkInside(paths: WasmPaths, objects: readonly string[]): void {
  const inside = (dir: string, object: string) => !relative(dir, object).startsWith(`..${sep}`)
  const outside = objects.filter(
    (object) => !inside(paths.out, object) && !inside(paths.asm, object),
  )
  if (outside.length > 0) {
    throw new Error(`the link takes objects outside ${paths.out}: ${outside.join(', ')}`)
  }
}

export function linkCommand(
  paths: WasmPaths,
  objects: readonly string[],
  optimise: CompileOptions['optimise'] = '-O2',
  sanitize?: Sanitizer,
): string[] {
  checkInside(paths, objects)
  const { globalBase, initialMemory, stackSize } = linkSettings()
  const exports = LINK_EXPORTS.map((name) => `_${name}`).join(',')
  return [
    paths.emcc,
    optimise,
    ...sanitizeFlags(sanitize),
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
