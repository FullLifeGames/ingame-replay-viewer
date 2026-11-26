// rom/gen3/wasm/wasm.json: the WebAssembly build of the expansion (#35). It pins the Emscripten
// release, the upstream files our glue replaces, the per-file defines and compiler flags, and the
// job cap (2: one clang per job, beside another session on the build machine's 12 GB). Our platform
// layer (rom/gen3/wasm/layer, #43) took the place of the borrowed platform files the config once
// pinned.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROM_DIR } from './rom-config.ts'

export interface WasmConfig {
  emscripten: { version: string }
  exclude: string[]
  defines: Record<string, string[]>
  flags: Record<string, string[]>
  jobs: number
}

export const WASM_DIR = join(ROM_DIR, 'wasm')

const VERSION = /^\d+\.\d+\.\d+$/
// A source of the tree, named from its root: src/x.c or deeper, never with a step up.
const TREE_SOURCE = /^src\/(?:[\w-]+\/)*[\w-]+\.c$/
const DEFINE = /^[A-Za-z_]\w*(?:=\S*)?$/
const FLAG = /^-[A-Za-z][\w=,.+-]*$/
// NAME=other_name: the preprocessor renames every use in the file, the file's own calls among
// them, so they reach the renamed body (review W1). An overlay patch changes such a file instead.
const RENAME = /^(\w+)=([A-Za-z_]\w*)$/

function fail(path: string, rule: string): never {
  throw new Error(`rom/gen3/wasm/wasm.json: ${path} ${rule}`)
}

function lookup(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => {
    return typeof at === 'object' && at !== null ? (at as Record<string, unknown>)[key] : undefined
  }, value)
}

function field(value: unknown, path: string, pattern: RegExp): string {
  const found = lookup(value, path)
  if (typeof found !== 'string' || !pattern.test(found)) fail(path, `must match ${String(pattern)}`)
  return found
}

function strings(found: unknown, path: string, pattern: RegExp): string[] {
  const list = Array.isArray(found) ? (found as unknown[]) : undefined
  if (list?.every((item) => typeof item === 'string' && pattern.test(item)) !== true) {
    fail(path, `must be a list of strings that match ${String(pattern)}`)
  }
  return list as string[]
}

function defines(found: unknown, path: string): string[] {
  const list = strings(found, path, DEFINE)
  for (const define of list) {
    const rename = RENAME.exec(define)
    if (rename !== null) {
      fail(
        path,
        `renames ${rename[1] ?? ''} to ${rename[2] ?? ''} in every use; patch the file instead`,
      )
    }
  }
  return list
}

// defines and flags: a source of the tree to its list.
function perSource(
  value: unknown,
  path: string,
  read: (list: unknown, at: string) => string[],
): Record<string, string[]> {
  const found = lookup(value, path)
  if (typeof found !== 'object' || found === null || Array.isArray(found)) {
    fail(path, `must map a source to its ${path}`)
  }
  return Object.fromEntries(
    Object.entries(found).map(([source, list]) => {
      if (!TREE_SOURCE.test(source)) fail(`${path}.${source}`, `must match ${String(TREE_SOURCE)}`)
      return [source, read(list, `${path}.${source}`)]
    }),
  )
}

function positiveInteger(value: unknown, path: string): number {
  const found = lookup(value, path)
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
    fail(path, 'must be a positive integer')
  }
  return found
}

// A field the build does not read would change nothing, silently.
const FIELDS = new Set(['emscripten', 'exclude', 'defines', 'flags', 'jobs'])

function checkFields(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  const unknown = Object.keys(value).find((key) => !FIELDS.has(key))
  if (unknown !== undefined) fail(unknown, 'is no field of the build')
}

export function readWasmConfig(text: string): WasmConfig {
  const value: unknown = JSON.parse(text)
  checkFields(value)
  return {
    emscripten: { version: field(value, 'emscripten.version', VERSION) },
    exclude: strings(lookup(value, 'exclude'), 'exclude', TREE_SOURCE),
    defines: perSource(value, 'defines', defines),
    flags: perSource(value, 'flags', (list, at) => strings(list, at, FLAG)),
    jobs: positiveInteger(value, 'jobs'),
  }
}

export function loadWasmConfig(path = join(WASM_DIR, 'wasm.json')): WasmConfig {
  return readWasmConfig(readFileSync(path, 'utf8'))
}
