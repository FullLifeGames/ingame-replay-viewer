import { describe, expect, it } from 'vitest'

import { decodeLzma } from './lzma'
import { fromBase64, joined, LZMA_STREAMS, textBytes } from './lzma.fixtures'

/** The coder properties of 7z's LZMA method: lc 3, lp 0, pb 2, then the dictionary size. */
const PROPERTIES_64K = Uint8Array.of(0x5d, 0x00, 0x00, 0x01, 0x00)

const stream = (name: 'lzmaMarker' | 'lzmaPlain') => fromBase64(LZMA_STREAMS[name])

describe('decodeLzma', () => {
  // Scene: 7z's LZMA method, as the core archives pack their headers.
  it('decodes a raw stream that ends with the end marker', () => {
    expect(decodeLzma(stream('lzmaMarker'), PROPERTIES_64K, 3000)).toEqual(textBytes(3000))
  })

  it('decodes a raw stream that stops at its size without a marker', () => {
    expect(decodeLzma(stream('lzmaPlain'), PROPERTIES_64K, 300)).toEqual(textBytes(300))
  })

  it('takes a dictionary under 4 KiB as 4 KiB', () => {
    // The text repeats every 51 bytes; a dictionary of 16 bytes would refuse its matches.
    const small = Uint8Array.of(0x5d, 0x10, 0x00, 0x00, 0x00)
    expect(decodeLzma(stream('lzmaMarker'), small, 3000)).toEqual(textBytes(3000))
  })

  // Scene: a stream that breaks the format throws a sentence that says how.
  it('refuses a stream that holds more than its size', () => {
    expect(() => decodeLzma(stream('lzmaMarker'), PROPERTIES_64K, 2999)).toThrow(
      'The LZMA stream holds more than its 2999 bytes.',
    )
  })

  it('refuses a stream that ends early', () => {
    expect(() => decodeLzma(stream('lzmaPlain').subarray(0, 100), PROPERTIES_64K, 300)).toThrow(
      'The LZMA stream ends early.',
    )
  })

  it('refuses a stream whose first byte is not zero', () => {
    const bytes = stream('lzmaPlain')
    bytes[0] = 1
    expect(() => decodeLzma(bytes, PROPERTIES_64K, 300)).toThrow(
      'The LZMA stream does not start with a zero byte.',
    )
  })

  it('refuses properties that are not five bytes', () => {
    expect(() => decodeLzma(stream('lzmaPlain'), Uint8Array.of(0x5d), 300)).toThrow(
      'The LZMA coder holds 1 property bytes; it needs 5.',
    )
  })

  it('refuses a properties byte of 225 or more', () => {
    const wrong = Uint8Array.of(0xe1, 0x00, 0x00, 0x01, 0x00)
    expect(() => decodeLzma(stream('lzmaPlain'), wrong, 300)).toThrow(
      'The LZMA properties byte 0xe1 is out of range: it must stay under 0xe1.',
    )
  })
})

describe('decodeLzma at the end of its size', () => {
  it('refuses a literal after its size', () => {
    expect(() => decodeLzma(stream('lzmaPlain'), PROPERTIES_64K, 299)).toThrow(
      'The LZMA stream holds more than its 299 bytes.',
    )
  })

  it('refuses a repeated match before the first byte', () => {
    const ones = joined(Uint8Array.of(0), new Uint8Array(16).fill(0xff))
    expect(() => decodeLzma(ones, PROPERTIES_64K, 10)).toThrow(
      'The LZMA stream repeats a match before its first byte.',
    )
  })

  it('refuses a stream whose coder does not end on its marker', () => {
    const bytes = stream('lzmaMarker')
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 0x01
    expect(() => decodeLzma(bytes, PROPERTIES_64K, 3000)).toThrow(
      'The LZMA stream does not end where its coder does.',
    )
  })

  it('refuses a stream whose marker comes before its size', () => {
    expect(() => decodeLzma(stream('lzmaMarker'), PROPERTIES_64K, 3001)).toThrow(
      'The LZMA stream ends with its marker after 3000 of 3001 bytes.',
    )
  })
})
