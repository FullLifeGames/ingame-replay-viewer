// A bit-field's write (#97, #137): the page writes a bit-field's value inside the one byte that
// holds its bits, under a mask, and leaves the byte's other bits as they are. The rule "a
// bit-field inside one byte" lives here alone; the generator's gauge reader imports it. Pure:
// the layouts come in from build/gen5/bw2.json.
import type { FieldLayout } from './bw2-numbers.ts'
import type { PointerChain } from './ram-chain.ts'
import type { MemoryWrite } from './ram-write.ts'

/** True when `field` is a bit-field whose bits lie inside one byte. */
export function inOneByte(field: FieldLayout | undefined): boolean {
  const { bit, bits } = field ?? {}
  return bit !== undefined && bits !== undefined && (bit % 8) + bits <= 8
}

/** A write of bits under a mask, its hops spelled out. */
type BitsWrite = Extract<MemoryWrite, { kind: 'bits' }> & { hops: readonly number[] }

/** The writes of a bit-field's value, inside the one byte that holds its bits. */
export function bitsWrite(
  field: string,
  chain: PointerChain & { hops: readonly number[] },
  at: FieldLayout,
  value: number,
): BitsWrite {
  const { bit, bits } = at
  if (bit === undefined || bits === undefined || !inOneByte(at)) {
    throw new Error(`${field} is no bit-field in one byte`)
  }
  const shift = bit % 8
  const last = chain.hops.slice(-1).map((hop) => hop + Math.floor(bit / 8))
  const hops = [...chain.hops.slice(0, -1), ...last]
  const mask = (2 ** bits - 1) * 2 ** shift
  return { kind: 'bits', field, address: chain.address, hops, mask, value: value * 2 ** shift }
}
