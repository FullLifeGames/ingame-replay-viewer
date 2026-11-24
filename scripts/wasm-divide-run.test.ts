// The division rewrite through Binaryen (#66): a small module with stand-in helpers goes through
// wasm-dis, the rewrite and wasm-as, then runs in Node. The stand-ins return libgcc 14.2.1's values
// of the ROM (.waves/04 plan-div fact 1, the issue's diagnosis); the 64-bit zero cases mirror the
// 32-bit ones until 66-3 traces __divdi3 and __udivdi3. A helper's own op stays an op: rewritten,
// it would call itself until the stack runs out. CI has no Emscripten, so this spec skips there.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { REPO_DIR } from './rom-paths.ts'
import { wasmPaths } from './wasm-compile.ts'
import { binaryenTool, DIVIDE_OPS, divideModule, helperName } from './wasm-divide.ts'
import type { DivideOp } from './wasm-divide.ts'

type Exports = Record<string, (a: never, b: never) => unknown>
interface Wasm {
  Module: (new (bytes: Uint8Array) => object) & {
    customSections: (module: object, name: string) => ArrayBuffer[]
  }
  Instance: new (module: object) => { exports: Exports }
}
// The scripts' TypeScript library does not declare WebAssembly.
const { WebAssembly } = globalThis as unknown as { WebAssembly: Wasm }

const { emcc } = wasmPaths(REPO_DIR)
const wasmAs = binaryenTool(emcc, 'wasm-as')

const LIMITS = {
  i32: { max: '2147483647', min: '-2147483648' },
  i64: { max: '9223372036854775807', min: '-9223372036854775808' },
}

// libgcc's answer to a zero divisor: the saturated quotient for a signed op (0 for 0), all ones
// for an unsigned one (0 for 0); the remainder answers as the quotient. INT_MIN / -1 is INT_MIN.
function standIn(op: DivideOp): string {
  const type = op.slice(0, 3) as 'i32' | 'i64'
  const { max, min } = LIMITS[type]
  const [n, d] = ['(local.get $n)', '(local.get $d)']
  const zero = op.endsWith('_s')
    ? `(select (${type}.const ${max}) (select (${type}.const ${min}) (${type}.const 0) (${type}.lt_s ${n} (${type}.const 0))) (${type}.gt_s ${n} (${type}.const 0)))`
    : `(select (${type}.const -1) (${type}.const 0) (i32.eqz (${type}.eqz ${n})))`
  const overflow = op.endsWith('div_s')
    ? `(if (i32.and (${type}.eq ${n} (${type}.const ${min})) (${type}.eq ${d} (${type}.const -1))) (then (return (${type}.const ${min}))))`
    : ''
  const name = helperName(op)
  return `(func $${name} (export "${name}") (param $n ${type}) (param $d ${type}) (result ${type})
    (if (${type}.eqz ${d}) (then (return ${zero}))) ${overflow} (${op} ${n} ${d}))`
}

const user = (op: DivideOp, i: number) => {
  const type = op.slice(0, 3)
  return `(func $Use${String(i)} (export "${op}") (param $n ${type}) (param $d ${type}) (result ${type})
    (${op} (local.get $n) (local.get $d)))`
}

let dir = ''
const users = DIVIDE_OPS.map(user).join('\n')

function assemble(name: string, text: string): string {
  const wat = join(dir, `${name}.wat`)
  writeFileSync(wat, `(module\n${text}\n)\n`)
  execFileSync(wasmAs, ['-g', wat, '-o', join(dir, `${name}.wasm`)])
  return join(dir, `${name}.wasm`)
}

describe.skipIf(!existsSync(wasmAs))(
  'the division rewrite through Binaryen (the build machine: CI has no Emscripten)',
  () => {
    let ops: Exports = {}
    let input = ''
    let output = ''

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'irv-divide-'))
      input = assemble('with-helpers', `${DIVIDE_OPS.map(standIn).join('\n')}\n${users}`)
      output = join(dir, 'divided.wasm')
      await divideModule(input, output, emcc)
      ops = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(output))).exports
    })
    afterAll(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    const run = (op: DivideOp, n: number | bigint, d: number | bigint) =>
      (ops[op] as (a: number | bigint, b: number | bigint) => number | bigint)(n, d)

    it('divides a 32-bit signed value by zero as libgcc does', () => {
      expect([run('i32.div_s', 7, 0), run('i32.div_s', -7, 0), run('i32.div_s', 0, 0)]).toEqual([
        2147483647, -2147483648, 0,
      ])
      expect([run('i32.rem_s', 7, 0), run('i32.rem_s', -7, 0), run('i32.rem_s', 0, 0)]).toEqual([
        2147483647, -2147483648, 0,
      ])
    })

    it('gives INT_MIN for INT_MIN / -1 and 0 for INT_MIN % -1', () => {
      expect(run('i32.div_s', -2147483648, -1)).toBe(-2147483648)
      expect(run('i32.rem_s', -2147483648, -1)).toBe(0)
      expect(run('i64.div_s', -(2n ** 63n), -1n)).toBe(-(2n ** 63n))
    })

    it('divides a 32-bit unsigned value by zero as libgcc does', () => {
      const unsigned = (value: number | bigint) => Number(value) >>> 0
      expect([run('i32.div_u', 7, 0), run('i32.div_u', 0, 0)].map(unsigned)).toEqual([
        0xffffffff, 0,
      ])
      expect([run('i32.rem_u', 7, 0), run('i32.rem_u', 0, 0)].map(unsigned)).toEqual([
        0xffffffff, 0,
      ])
    })

    it('keeps the operands in their order and the ops unsigned where they were', () => {
      expect([run('i32.div_s', 7, 2), run('i32.div_s', 2, 7), run('i32.rem_s', -7, 2)]).toEqual([
        3, 0, -1,
      ])
      expect([run('i32.div_u', -2, 2), run('i32.rem_u', 2, 7)]).toEqual([2147483647, 2])
      expect([run('i64.div_s', 7n, 2n), run('i64.rem_s', 2n, 7n)]).toEqual([3n, 2n])
      expect([run('i64.div_u', -2n, 2n), run('i64.rem_u', 7n, 3n)]).toEqual([2n ** 63n - 1n, 1n])
    })

    it('calls the 64-bit helpers on a zero divisor', () => {
      expect([run('i64.div_s', 7n, 0n), run('i64.rem_s', -7n, 0n)]).toEqual([
        2n ** 63n - 1n,
        -(2n ** 63n),
      ])
      expect([run('i64.div_u', 7n, 0n), run('i64.rem_u', 0n, 0n)]).toEqual([-1n, 0n])
    })

    it('keeps the module name section as it was', () => {
      const names = (path: string) =>
        WebAssembly.Module.customSections(new WebAssembly.Module(readFileSync(path)), 'name').map(
          (section) => Buffer.from(section).toString('hex'),
        )
      expect(names(output)).toEqual(names(input))
    })

    it('reports the sites it rewrote and the ops it left in the helpers', async () => {
      const counts = await divideModule(input, join(dir, 'again.wasm'), emcc)
      expect(Object.values(counts.rewritten)).toEqual(DIVIDE_OPS.map(() => 1))
      expect(Object.values(counts.inHelpers)).toEqual(DIVIDE_OPS.map(() => 1))
    })

    it('refuses a module without the helpers and writes nothing', async () => {
      const bare = assemble('bare', users)
      const refused = join(dir, 'refused.wasm')
      await expect(divideModule(bare, refused, emcc)).rejects.toThrow(
        'the module lacks the division helpers IrvWasm_I32DivS,',
      )
      expect(existsSync(refused)).toBe(false)
    })
  },
)
