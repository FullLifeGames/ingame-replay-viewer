import { describe, expect, it } from 'vitest'

import { sha1Hex } from './sha1'

const bytesOf = (text: string) => new TextEncoder().encode(text)

// The test vectors of FIPS 180-2 (appendix A) and RFC 3174, and the empty message.
describe('sha1Hex', () => {
  it('hashes "abc" to a9993e36...', async () => {
    expect(await sha1Hex(bytesOf('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('hashes the empty message', async () => {
    expect(await sha1Hex(new Uint8Array(0))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('hashes the two-block message of FIPS 180-2', async () => {
    const message = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(await sha1Hex(bytesOf(message))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1')
  })

  it('hashes a million "a"', async () => {
    const million = new Uint8Array(1_000_000).fill(0x61)
    expect(await sha1Hex(million)).toBe('34aa973cd4c4daa4f61eeb2bdbad27316534016f')
  })

  it('hashes the viewed bytes of a subarray only', async () => {
    const framed = bytesOf('xabcx').subarray(1, 4)
    expect(await sha1Hex(framed)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('hashes bytes on a SharedArrayBuffer', async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(3))
    shared.set(bytesOf('abc'))
    expect(await sha1Hex(shared)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })
})
