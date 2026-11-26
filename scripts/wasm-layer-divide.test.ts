// The glue's division helpers (#66), run natively in the host harness on the rows of
// wasm-divide-rows.ts, which also holds where each expected value comes from.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DIVIDE_OPS, helperName } from './wasm-divide.ts'
import { bits, DIVIDE_CASES } from './wasm-divide-rows.ts'
import type { DivideCase } from './wasm-divide-rows.ts'
import { buildHost, runLayer } from './wasm-layer.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-divide-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

// One record per case: the op's index, then the numerator and the divisor as two words each.
function record({ op, n, d }: DivideCase): number[] {
  const words = (value: bigint) => {
    const unsigned = BigInt.asUintN(64, value)
    return [Number(unsigned & 0xffffffffn), Number(unsigned >> 32n)]
  }
  return [DIVIDE_OPS.indexOf(op), ...words(n), ...words(d)]
}

let results: bigint[] = []
beforeAll(() => {
  const host = buildHost(scratch)
  const words = Uint32Array.from(DIVIDE_CASES.flatMap(record))
  const { dest } = runLayer(host, 'divide', {
    src: new Uint8Array(words.buffer),
    dest: new Uint8Array(DIVIDE_CASES.length * 8),
  })
  results = Array.from(new BigUint64Array(dest.slice().buffer))
}, 60_000)

describe('the division helpers return what libgcc 14.2.1 returns', () => {
  it.each(DIVIDE_CASES.map((one, i) => [helperName(one.op), one.n, one.d, i] as const))(
    '%s(%s, %s)',
    (_name, _n, _d, i) => {
      const { op, expected } = DIVIDE_CASES[i] ?? { op: 'i32.div_s', expected: -1n }
      expect(results[i]).toBe(BigInt.asUintN(bits(op), expected))
    },
  )
})
