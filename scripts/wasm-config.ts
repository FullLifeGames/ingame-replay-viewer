// rom/gen3/wasm/wasm.json: the WebAssembly build of the expansion (#35). It pins the Emscripten
// release, the platform layer borrowed at build time and never committed (plan D7) with the
// defines its files compile under, the upstream files our glue replaces, the per-file defines and
// compiler flags, and the job cap (2: one clang per job, beside another session on devbox's 12 GB).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROM_DIR } from './rom-config.ts'

interface PlatformPin {
  repository: string
  commit: string
  files: string[]
  defines: string[]
}

export interface WasmConfig {
  emscripten: { version: string }
  platform: PlatformPin
  exclude: string[]
  defines: Record<string, string[]>
  flags: Record<string, string[]>
  jobs: number
}

export const WASM_DIR = join(ROM_DIR, 'wasm')

const FULL_SHA1 = /^[0-9a-f]{40}$/
const VERSION = /^\d+\.\d+\.\d+$/
const NO_SPACE = /^\S+$/
// A source of the tree, named from its root: src/x.c or deeper, never with a step up.
const TREE_SOURCE = /^src\/(?:[\w-]+\/)*[\w-]+\.c$/
const RELATIVE_FILE = /^(?:[\w-]+\/)*[\w-]+\.[ch]$/
const DEFINE = /^[A-Za-z_]\w*(?:=\S*)?$/
const FLAG = /^-[A-Za-z][\w=,.+-]*$/

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

function nonEmpty(list: string[], path: string): string[] {
  if (list.length === 0) fail(path, 'must name at least one file')
  return list
}

// defines and flags: a source of the tree to its list.
function perSource(value: unknown, path: string, pattern: RegExp): Record<string, string[]> {
  const found = lookup(value, path)
  if (typeof found !== 'object' || found === null || Array.isArray(found)) {
    fail(path, `must map a source to its ${path}`)
  }
  return Object.fromEntries(
    Object.entries(found).map(([source, list]) => {
      if (!TREE_SOURCE.test(source)) fail(`${path}.${source}`, `must match ${String(TREE_SOURCE)}`)
      return [source, strings(list, `${path}.${source}`, pattern)]
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

export function readWasmConfig(text: string): WasmConfig {
  const value: unknown = JSON.parse(text)
  return {
    emscripten: { version: field(value, 'emscripten.version', VERSION) },
    platform: {
      repository: field(value, 'platform.repository', NO_SPACE),
      commit: field(value, 'platform.commit', FULL_SHA1),
      files: nonEmpty(
        strings(lookup(value, 'platform.files'), 'platform.files', RELATIVE_FILE),
        'platform.files',
      ),
      defines: strings(lookup(value, 'platform.defines'), 'platform.defines', DEFINE),
    },
    exclude: strings(lookup(value, 'exclude'), 'exclude', TREE_SOURCE),
    defines: perSource(value, 'defines', DEFINE),
    flags: perSource(value, 'flags', FLAG),
    jobs: positiveInteger(value, 'jobs'),
  }
}

export function loadWasmConfig(path = join(WASM_DIR, 'wasm.json')): WasmConfig {
  return readWasmConfig(readFileSync(path, 'utf8'))
}
