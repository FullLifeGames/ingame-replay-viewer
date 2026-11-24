import { describe, expect, it } from 'vitest'

import { fromBase64, sha256, toBase64 } from './codec'

// Scene: a state and a frame cross from the page to the run's script as base64, and a mark's
// main RAM hash must equal the one the next run checks its load against.
describe('codec', () => {
  it('turns bytes into base64 and back, past one chunk of 0x8000 bytes', () => {
    const bytes = Uint8Array.from({ length: 0x8000 + 300 }, (_, i) => (i * 7) % 256)
    const text = toBase64(bytes)
    // The same text as one btoa over the whole string, which a chunk boundary must not change.
    expect(text).toBe(btoa(String.fromCharCode(...bytes)))
    expect(fromBase64(text)).toEqual(bytes)
  })

  it('writes the known base64 of short inputs', () => {
    expect(toBase64(new TextEncoder().encode('Black 2'))).toBe('QmxhY2sgMg==')
    expect(fromBase64('AP8=')).toEqual(Uint8Array.of(0, 255))
  })

  // The two vectors of FIPS 180-2's SHA-256 examples: "abc" and the empty message.
  it('gives the SHA-256 of the FIPS examples in lowercase hex', async () => {
    expect(await sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
})
