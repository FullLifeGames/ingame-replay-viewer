// npm run wasm:convert [object ...]: the data objects of the ROM build as wasm objects (#35). Each
// named object (a path under the tree's build/emerald, such as data/battle_scripts_1.o; all data
// objects without a name) is converted to wasm assembly by wasm-data-asm.ts and assembled with
// `emcc -c`. Function targets take their signatures from the C objects in build/wasm/obj, which
// `npm run wasm:census` compiles. Everything lands under build/wasm/asm, with convert.json listing
// the sizes, the function targets and the data targets that nothing defines.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'

import { runCli } from './rom-cli.ts'
import { REPO_DIR } from './rom-paths.ts'
import { checkEmccVersion } from './wasm-build.ts'
import { wasmPaths } from './wasm-compile.ts'
import { loadWasmConfig } from './wasm-config.ts'
import { convertElf, symbolLookup } from './wasm-data-asm.ts'
import type { SymbolLookup } from './wasm-data-asm.ts'
import { readElf } from './wasm-elf.ts'
import { mergeWasmSymbols, readWasmSymbols } from './wasm-signatures.ts'

export interface ConvertPaths {
  // The ROM build's object folder in the tree.
  build: string
  out: string
}

export interface ConvertTarget {
  object: string
  elf: string
  asm: string
  wasm: string
}

interface ConvertResult {
  object: string
  elfBytes: number
  asmBytes: number
  wasmBytes: number
  functions: number
  effects: number
  undefined: string[]
  assembled: boolean
  stderr: string
}

const say = (line: string) => process.stdout.write(`wasm:convert: ${line}\n`)

const listing = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((name) => name.split(sep).join('/'))

// The Makefile assembles the data from data/*.s and sound/; src/ holds the C and code objects.
export function dataObjects(names: readonly string[]): string[] {
  return names
    .filter((name) => name.endsWith('.o') && /^(data\/[^/]+|sound\/.+)\.o$/.test(name))
    .sort()
}

export function convertTargets(objects: readonly string[], paths: ConvertPaths): ConvertTarget[] {
  return objects.map((object) => {
    const clean = normalize(object)
    if (isAbsolute(object) || clean.startsWith('..') || !clean.endsWith('.o')) {
      throw new Error(`${object} names no object under ${paths.build}`)
    }
    const stem = join(paths.out, 'asm', clean.replace(/\.o$/, ''))
    return { object: clean, elf: join(paths.build, clean), asm: `${stem}.s`, wasm: `${stem}.o` }
  })
}

function lookupFor(build: string, obj: string): SymbolLookup {
  const elfs = dataObjects(listing(build)).map((name) =>
    readElf(readFileSync(join(build, name)), name),
  )
  const objects = listing(obj).filter((name) => name.endsWith('.o'))
  if (objects.length === 0) throw new Error(`no C objects in ${obj}; run npm run wasm:census`)
  const wasm = objects.map((name) => readWasmSymbols(readFileSync(join(obj, name)), name))
  say(`${String(elfs.length)} data objects, ${String(objects.length)} C objects read`)
  return symbolLookup(elfs, mergeWasmSymbols(wasm))
}

function convertOne(target: ConvertTarget, lookup: SymbolLookup, emcc: string): ConvertResult {
  const bytes = readFileSync(target.elf)
  const converted = convertElf(readElf(bytes, target.object), lookup, target.object)
  mkdirSync(dirname(target.asm), { recursive: true })
  writeFileSync(target.asm, converted.text)
  const run = spawnSync(emcc, ['-c', target.asm, '-o', target.wasm], { encoding: 'utf8' })
  const assembled = run.status === 0
  return {
    object: target.object,
    elfBytes: bytes.length,
    asmBytes: Buffer.byteLength(converted.text),
    wasmBytes: assembled ? statSync(target.wasm).size : 0,
    functions: converted.functions.length,
    effects: converted.effects.length,
    undefined: converted.undefined,
    assembled,
    stderr: run.stderr.trim(),
  }
}

// A refusal of the converter is a result too: the run goes on and fails at its end.
function convertOrRefuse(target: ConvertTarget, lookup: SymbolLookup, emcc: string): ConvertResult {
  try {
    return convertOne(target, lookup, emcc)
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error)
    const empty = {
      elfBytes: 0,
      asmBytes: 0,
      wasmBytes: 0,
      functions: 0,
      effects: 0,
      undefined: [],
    }
    return { object: target.object, ...empty, assembled: false, stderr }
  }
}

function main(): void {
  runCli('wasm:convert', () => {
    const paths = wasmPaths(REPO_DIR)
    const banner = execFileSync(paths.emcc, ['--version'], { encoding: 'utf8' })
    checkEmccVersion(banner, loadWasmConfig().emscripten.version)
    const build = join(paths.tree, 'build', 'emerald')
    const named = process.argv.slice(2)
    const objects = named.length > 0 ? named : dataObjects(listing(build))
    const targets = convertTargets(objects, { build, out: paths.out })
    const lookup = lookupFor(build, paths.obj)
    const results = targets.map((target) => {
      const result = convertOrRefuse(target, lookup, paths.emcc)
      const state = result.assembled ? 'assembled' : `FAILED\n${result.stderr}`
      say(
        `${result.object}: ${String(result.elfBytes)} B ELF, ${String(result.asmBytes)} B asm, ${String(result.wasmBytes)} B wasm, ${String(result.functions)} functions, ${String(result.effects)} effect functions, ${String(result.undefined.length)} undefined; ${state}`,
      )
      return result
    })
    writeFileSync(join(paths.out, 'asm', 'convert.json'), `${JSON.stringify(results, null, 2)}\n`)
    if (results.some((result) => !result.assembled)) throw new Error('an object did not assemble')
  })
}

if (import.meta.main) main()
