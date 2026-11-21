import { describe, expect, it } from 'vitest'

import { applyBps } from './bps-apply.ts'
import { createBps } from './bps-create.ts'

const KIB = 1024

// Deterministic noise (xorshift32), so no two 8-byte grams repeat by accident.
function noise(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let state = seed
  for (let index = 0; index < length; index++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    bytes[index] = state & 0xff
  }
  return bytes
}

const join = (...parts: Uint8Array[]) => {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  return joined
}

const filled = (length: number, byte: number) => new Uint8Array(length).fill(byte)

// The patch size beyond the one for an unchanged copy of the source.
const extraCost = (source: Uint8Array, target: Uint8Array) =>
  createBps(source, target).length - createBps(source, source).length

describe('createBps', () => {
  it('round-trips 1 MiB with a moved block, inserted bytes, a zero area and a 0xFF tail', () => {
    const source = noise(768 * KIB, 1)
    const target = join(
      source.subarray(0, 100 * KIB),
      source.subarray(164 * KIB, 400 * KIB),
      noise(300, 2),
      source.subarray(400 * KIB, 600 * KIB),
      filled(32 * KIB, 0),
      source.subarray(100 * KIB, 164 * KIB),
      source.subarray(600 * KIB),
      filled(1024 * KIB - 768 * KIB - 32 * KIB - 300, 0xff),
    )
    expect(target.length).toBe(1024 * KIB)
    const patch = createBps(source, target)
    expect(applyBps(patch, source)).toEqual(target)
    expect(patch.length).toBeLessThan(1 * KIB)
  })

  it('keeps an unchanged copy to a few bytes', () => {
    const source = noise(256 * KIB, 3)
    expect(createBps(source, source).length).toBeLessThan(32)
  })

  it('pays under 16 bytes for a 1 MiB 0xFF tail', () => {
    const source = noise(256 * KIB, 4)
    expect(extraCost(source, join(source, filled(1024 * KIB, 0xff)))).toBeLessThan(16)
  })

  it('pays under 32 bytes for a moved 64 KiB block', () => {
    const source = noise(512 * KIB, 5)
    const target = join(
      source.subarray(0, 100 * KIB),
      source.subarray(164 * KIB),
      source.subarray(100 * KIB, 164 * KIB),
    )
    expect(applyBps(createBps(source, target), source)).toEqual(target)
    expect(extraCost(source, target)).toBeLessThan(32)
  })

  it('stores changed bytes that match nothing as they are', () => {
    const source = noise(64 * KIB, 6)
    const target = source.slice()
    target.set(noise(5, 7), 1000)
    const patch = createBps(source, target)
    expect(applyBps(patch, source)).toEqual(target)
    expect(patch.length - createBps(source, source).length).toBeLessThan(16)
  })

  it('writes the same patch twice', () => {
    const source = noise(128 * KIB, 8)
    const target = join(noise(4 * KIB, 9), source, filled(20, 0))
    expect(createBps(source, target)).toEqual(createBps(source, target))
  })

  it.each([
    ['an empty source', new Uint8Array(0), noise(100, 10)],
    ['an empty target', noise(100, 11), new Uint8Array(0)],
    ['a target shorter than one match', noise(100, 12), noise(5, 13)],
    ['a short run', noise(100, 14), join(noise(20, 15), filled(12, 7), noise(20, 16))],
  ])('round-trips %s', (_, source, target) => {
    expect(applyBps(createBps(source, target), source)).toEqual(target)
  })
})
