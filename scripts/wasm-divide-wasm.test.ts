// The glue's division helpers (#66, #92) as WebAssembly runs them: the emsdk's clang compiles
// irv_wasm_divide.c to wasm32 with no libc, and each helper runs on the rows the native spec runs
// (wasm-divide-rows.ts). The native harness cannot show that clang's WebAssembly code of a helper
// never reaches a trapping op; this spec runs that code. It skips without the emsdk (CI has none).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { REPO_DIR } from './rom-paths.ts'
import { wasmPaths } from './wasm-compile.ts'
import { WASM_DIR } from './wasm-config.ts'
import { DIVIDE_OPS, helperName } from './wasm-divide.ts'
import { bits, DIVIDE_CASES } from './wasm-divide-rows.ts'
import type { DivideCase } from './wasm-divide-rows.ts'

// emcc sits in upstream/emscripten, its clang in upstream/bin.
const CLANG = join(dirname(dirname(wasmPaths(REPO_DIR).emcc)), 'bin', 'clang')
const SOURCE = join(WASM_DIR, 'src', 'irv_wasm_divide.c')

type Helper = (n: number | bigint, d: number | bigint) => number | bigint
interface Wasm {
  Module: new (bytes: Uint8Array) => object
  Instance: new (module: object) => { exports: Record<string, Helper> }
}
// The scripts' TypeScript library does not declare WebAssembly.
const { WebAssembly } = globalThis as unknown as { WebAssembly: Wasm }

const scratch = mkdtempSync(join(tmpdir(), 'irv-divide-wasm-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** The helpers' module: no libc and no entry, the eight helpers exported by name. */
function compileHelpers(): Record<string, Helper> {
  const out = join(scratch, 'divide.wasm')
  const exports = DIVIDE_OPS.map((op) => `-Wl,--export=${helperName(op)}`)
  const flags = ['--target=wasm32', '-nostdlib', '-ffreestanding', '-O2', '-Wl,--no-entry']
  const result = spawnSync(CLANG, [...flags, ...exports, SOURCE, '-o', out], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`the helpers do not compile:\n${result.stderr}`)
  const module = new WebAssembly.Module(readFileSync(out))
  return new WebAssembly.Instance(module).exports
}

/** A case's call: i32 operands go in as numbers and i64 operands as bigints, both signed. */
function call(helpers: Record<string, Helper>, { op, n, d }: DivideCase): bigint {
  const helper = helpers[helperName(op)]
  if (helper === undefined) throw new Error(`the module exports no ${helperName(op)}`)
  if (bits(op) === 64)
    return BigInt.asUintN(64, BigInt(helper(BigInt.asIntN(64, n), BigInt.asIntN(64, d))))
  const result = helper(Number(BigInt.asIntN(32, n)), Number(BigInt.asIntN(32, d)))
  return BigInt.asUintN(32, BigInt(result))
}

describe.skipIf(!existsSync(CLANG))(
  'the division helpers compiled to WebAssembly return what libgcc 14.2.1 returns (emsdk)',
  () => {
    let helpers: Record<string, Helper> = {}
    beforeAll(() => {
      helpers = compileHelpers()
    }, 60_000)

    it.each(DIVIDE_CASES.map((one, i) => [helperName(one.op), one.n, one.d, i] as const))(
      '%s(%s, %s)',
      (_name, _n, _d, i) => {
        const one = DIVIDE_CASES[i]
        if (one === undefined) throw new Error(`no case ${String(i)}`)
        expect(call(helpers, one)).toBe(BigInt.asUintN(bits(one.op), one.expected))
      },
    )
  },
)
