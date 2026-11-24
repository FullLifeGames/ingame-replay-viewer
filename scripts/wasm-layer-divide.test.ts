// The glue's division helpers (#66), run natively in the host harness. WebAssembly traps on a zero
// divisor and on INT_MIN / -1; the ROM's libgcc 14.2.1 (thumb/nofp) returns a value for each and
// goes on, and the helpers must return the same. Every expected value below is what libgcc's own
// code returned when run on these arguments:
// - 32 bits: the ROM's __divsi3, __udivsi3, __modsi3 and __umodsi3;
// - 64-bit quotients: the ROM's __divdi3 and __udivdi3;
// - 64-bit remainders: __moddi3 and __umoddi3 from the same archive, which the ROM does not link,
//   because its C takes no 64-bit remainder.
// By zero, the 64-bit results depend on the numerator's bit length; the rows hold its edges.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DIVIDE_OPS, helperName } from './wasm-divide.ts'
import type { DivideOp } from './wasm-divide.ts'
import { buildHost, runLayer } from './wasm-layer.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-divide-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** A numerator, a divisor, then the results of div_s, div_u, rem_s and rem_u, as in DIVIDE_OPS. */
type Row = readonly [bigint, bigint, bigint, bigint, bigint, bigint]

const MIN32 = -(1n << 31n)
const MAX64 = (1n << 63n) - 1n
const MIN64 = -(1n << 63n)
const ONES64 = (1n << 64n) - 1n

const ROWS_32: readonly Row[] = [
  [0n, 0n, 0n, 0n, 0n, 0n],
  [7n, 0n, 0x7fffffffn, 0xffffffffn, 0x7fffffffn, 0xffffffffn],
  [-7n, 0n, MIN32, 0xffffffffn, MIN32, 0xffffffffn],
  [MIN32, 0n, MIN32, 0xffffffffn, MIN32, 0xffffffffn],
  [MIN32, -1n, MIN32, 0n, 0n, 0x80000000n],
  [7n, 2n, 3n, 3n, 1n, 1n],
  [-7n, 2n, -3n, 0x7ffffffcn, -1n, 1n],
]

const ROWS_64: readonly Row[] = [
  [0n, 0n, 1n, 1n, 0n, 0n],
  [1n, 0n, 3n, 3n, 1n, 1n],
  [7n, 0n, 15n, 15n, 7n, 7n],
  [-1n, 0n, -3n, ONES64, -1n, 0n],
  [-7n, 0n, -15n, ONES64, -7n, 0n],
  [100n, 0n, 255n, 255n, 100n, 100n],
  [0xffffffffn, 0n, 0x1ffffffffn, 0x1ffffffffn, 0xffffffffn, 0xffffffffn],
  [0x100000000n, 0n, 0x3ffffffffn, 0x3ffffffffn, 0n, 0n],
  [0x123456789n, 0n, 0x3ffffffffn, 0x3ffffffffn, 0x23456789n, 0x23456789n],
  [(1n << 62n) + 5n, 0n, -1n, ONES64, 1n, 1n],
  [MIN64, 0n, 1n, ONES64, 0n, 0n],
  [MAX64, 0n, -1n, ONES64, 1n, 1n],
  [MIN64, -1n, MIN64, 0n, 0n, 1n << 63n],
  [MIN64, 1n, MIN64, 1n << 63n, 0n, 0n],
  [7n, 2n, 3n, 3n, 1n, 1n],
  [-7n, 2n, -3n, 0x7ffffffffffffffcn, -1n, 1n],
  [7n, -2n, -3n, 0n, 1n, 7n],
  [-7n, -2n, 3n, 0n, -1n, ONES64 - 6n],
]

interface Case {
  op: DivideOp
  n: bigint
  d: bigint
  expected: bigint
}

function casesOf(rows: readonly Row[], ops: readonly DivideOp[]): Case[] {
  return rows.flatMap(([n, d, ...results]) =>
    ops.map((op, i) => ({ op, n, d, expected: results[i] ?? 0n })),
  )
}

const CASES = [
  ...casesOf(ROWS_32, DIVIDE_OPS.slice(0, 4)),
  ...casesOf(ROWS_64, DIVIDE_OPS.slice(4)),
]

const bits = (op: DivideOp) => (op.startsWith('i32') ? 32 : 64)

// One record per case: the op's index, then the numerator and the divisor as two words each.
function record({ op, n, d }: Case): number[] {
  const words = (value: bigint) => {
    const unsigned = BigInt.asUintN(64, value)
    return [Number(unsigned & 0xffffffffn), Number(unsigned >> 32n)]
  }
  return [DIVIDE_OPS.indexOf(op), ...words(n), ...words(d)]
}

let results: bigint[] = []
beforeAll(() => {
  const host = buildHost(scratch)
  const words = Uint32Array.from(CASES.flatMap(record))
  const { dest } = runLayer(host, 'divide', {
    src: new Uint8Array(words.buffer),
    dest: new Uint8Array(CASES.length * 8),
  })
  results = Array.from(new BigUint64Array(dest.slice().buffer))
}, 60_000)

describe('the division helpers return what libgcc 14.2.1 returns', () => {
  it.each(CASES.map((one, i) => [helperName(one.op), one.n, one.d, i] as const))(
    '%s(%s, %s)',
    (_name, _n, _d, i) => {
      const { op, expected } = CASES[i] ?? { op: 'i32.div_s', expected: -1n }
      expect(results[i]).toBe(BigInt.asUintN(bits(op), expected))
    },
  )
})
