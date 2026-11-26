// The clang that compiles C for wasm32 with no libc (#92): the emsdk's own where it stands, else a
// clang on PATH that lists wasm32 among its targets and finds wasm-ld to link with. CI has no emsdk
// and takes the second; scripts/wasm-divide-wasm.test.ts runs the helpers through it.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { REPO_DIR } from './rom-paths.ts'
import { wasmPaths } from './wasm-compile.ts'

/** What the choice reads of the machine; a spec hands in invented answers. */
export interface ClangProbe {
  exists: (path: string) => boolean
  /** A command's standard output, or undefined when it does not start or exits with an error. */
  run: (command: string, args: readonly string[]) => string | undefined
}

export type WasmClang =
  { path: string; from: "the emsdk's clang" | 'clang on PATH' } | { missing: string }

export const CLANG_INSTALL =
  'no clang for wasm32: install the emsdk, or clang and lld (wasm-ld) on PATH'

/** The emsdk's clang, beside its emcc: emcc sits in upstream/emscripten, clang in upstream/bin. */
export const emsdkClang = (emcc: string): string => join(dirname(dirname(emcc)), 'bin', 'clang')

const listsWasm32 = (targets: string): boolean => /^\s*wasm32\s/m.test(targets)

/** The clang to take, and which one it is; `missing` says what to install when none fits. */
export function wasmClang(emsdk: string, probe: ClangProbe): WasmClang {
  if (probe.exists(emsdk)) return { path: emsdk, from: "the emsdk's clang" }
  const targets = probe.run('clang', ['--print-targets'])
  if (targets === undefined || !listsWasm32(targets)) return { missing: CLANG_INSTALL }
  // clang prints the bare name back when it finds no such program.
  const linker = probe.run('clang', ['--print-prog-name=wasm-ld'])?.trim() ?? ''
  if (!isAbsolute(linker)) return { missing: CLANG_INSTALL }
  return { path: 'clang', from: 'clang on PATH' }
}

const machine: ClangProbe = {
  exists: existsSync,
  run: (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    return result.status === 0 ? result.stdout : undefined
  },
}

/** The choice on this machine. */
export const findWasmClang = (): WasmClang =>
  wasmClang(emsdkClang(wasmPaths(REPO_DIR).emcc), machine)
