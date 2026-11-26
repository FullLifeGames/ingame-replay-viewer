import { describe, expect, it } from 'vitest'

import { CLANG_INSTALL, emsdkClang, wasmClang } from './wasm-clang.ts'
import type { ClangProbe } from './wasm-clang.ts'

const EMSDK = '/opt/emsdk/upstream/bin/clang'
const WITH_WASM = '  Registered Targets:\n    arm      - ARM\n    wasm32   - WebAssembly 32-bit\n'
const WITHOUT_WASM = '  Registered Targets:\n    x86-64   - 64-bit X86: EM64T and AMD64\n'

/** A machine with the given files and the given answers of clang, keyed by its first argument. */
function probe(files: string[], answers: Record<string, string>): ClangProbe {
  return {
    exists: (path) => files.includes(path),
    run: (command, args) => (command === 'clang' ? answers[args[0] ?? ''] : undefined),
  }
}

describe('the clang for wasm32', () => {
  it('sits beside the emsdk emcc', () => {
    expect(emsdkClang('/opt/emsdk/upstream/emscripten/emcc')).toBe(EMSDK)
  })

  it("takes the emsdk's clang where it stands, before one on PATH", () => {
    const machine = probe([EMSDK], {
      '--print-targets': WITH_WASM,
      '--print-prog-name=wasm-ld': '/usr/bin/wasm-ld\n',
    })
    expect(wasmClang(EMSDK, machine)).toEqual({ path: EMSDK, from: "the emsdk's clang" })
  })

  it('takes clang on PATH when it lists wasm32 and finds wasm-ld', () => {
    const machine = probe([], {
      '--print-targets': WITH_WASM,
      '--print-prog-name=wasm-ld': '/usr/lib/llvm-18/bin/wasm-ld\n',
    })
    expect(wasmClang(EMSDK, machine)).toEqual({ path: 'clang', from: 'clang on PATH' })
  })

  it('takes no clang on PATH that lacks wasm32', () => {
    const machine = probe([], {
      '--print-targets': WITHOUT_WASM,
      '--print-prog-name=wasm-ld': '/usr/bin/wasm-ld\n',
    })
    expect(wasmClang(EMSDK, machine)).toEqual({ missing: CLANG_INSTALL })
  })

  it('takes no clang on PATH that finds no wasm-ld', () => {
    const machine = probe([], {
      '--print-targets': WITH_WASM,
      '--print-prog-name=wasm-ld': 'wasm-ld\n',
    })
    expect(wasmClang(EMSDK, machine)).toEqual({ missing: CLANG_INSTALL })
  })

  it('says what to install when no clang runs at all', () => {
    expect(wasmClang(EMSDK, probe([], {}))).toEqual({ missing: CLANG_INSTALL })
    expect(CLANG_INSTALL).toMatch(/emsdk.*clang and lld/)
  })
})
