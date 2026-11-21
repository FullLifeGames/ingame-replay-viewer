import { describe, expect, it } from 'vitest'

import { crc32 } from './crc32.ts'

const ascii = (text: string) => new TextEncoder().encode(text)

describe('crc32', () => {
  it('gives the check value of the CRC-32/ISO-HDLC catalogue entry', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926)
  })

  it('gives 0 for no bytes', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('returns an unsigned value', () => {
    expect(crc32(ascii('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})
