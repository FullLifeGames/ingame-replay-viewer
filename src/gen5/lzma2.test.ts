import { describe, expect, it } from 'vitest'

import {
  fromBase64,
  joined,
  LZMA_STREAMS,
  OTHER_PHRASE,
  seededBytes,
  textBytes,
  wordBytes,
} from './lzma.fixtures'
import { decodeLzma2 } from './lzma2'

/** The dictionary property of the fixtures: 64 KiB. */
const DICT_64K = 0x10

/** The first index where the two differ, or -1; a whole-array match of megabytes is slow. */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : length
}

const stream = (name: keyof typeof LZMA_STREAMS) => fromBase64(LZMA_STREAMS[name])

describe('decodeLzma2', () => {
  // Scene: each chunk kind gives the bytes it was made from.
  it('decodes one LZMA chunk that resets everything', () => {
    expect(decodeLzma2(stream('text'), DICT_64K, 3000)).toEqual(textBytes(3000))
  })

  it('decodes an uncompressed chunk with a dictionary reset', () => {
    expect(decodeLzma2(stream('seeded'), DICT_64K, 600)).toEqual(seededBytes(600))
  })

  it('decodes a stream of two LZMA chunks where the second resets nothing', () => {
    const expected = joined(textBytes(2_797_152), seededBytes(200))
    const bytes = decodeLzma2(stream('long'), DICT_64K, expected.length)
    expect(bytes.length).toBe(expected.length)
    expect(firstDifference(bytes, expected)).toBe(-1)
  })

  it('decodes uncompressed chunks with and without a reset and LZMA chunks of every reset', () => {
    const expected = joined(
      textBytes(1000),
      new Uint8Array(24),
      seededBytes(299),
      new Uint8Array(1),
      textBytes(800),
      textBytes(600, OTHER_PHRASE),
      seededBytes(200, 7),
      textBytes(500),
    )
    const bytes = decodeLzma2(stream('kinds'), DICT_64K, expected.length)
    expect(firstDifference(bytes, expected)).toBe(-1)
  })

  it('decodes matches at the four last distances and of every length class', () => {
    expect(decodeLzma2(stream('words'), DICT_64K, 3000)).toEqual(wordBytes(3000))
  })

  it('follows a match over 4 KiB back in a dictionary of 64 KiB', () => {
    const expected = joined(textBytes(1000), textBytes(5000, OTHER_PHRASE), textBytes(1000))
    expect(firstDifference(decodeLzma2(stream('far'), DICT_64K, 7000), expected)).toBe(-1)
  })

  // Scene: a stream that breaks the format throws a sentence that says how.
  it('refuses a stream that ends inside a chunk', () => {
    expect(() => decodeLzma2(stream('text').subarray(0, 40), DICT_64K, 3000)).toThrow(
      'The LZMA2 stream ends inside a chunk.',
    )
  })

  it('refuses a stream that ends before its end byte', () => {
    const text = stream('text')
    expect(() => decodeLzma2(text.subarray(0, text.length - 1), DICT_64K, 3000)).toThrow(
      'The LZMA2 stream ends before its end byte.',
    )
  })

  it('refuses a control byte that no chunk kind uses', () => {
    expect(() => decodeLzma2(Uint8Array.of(0x05), DICT_64K, 1)).toThrow(
      'The LZMA2 stream holds the control byte 0x05, which names no chunk kind.',
    )
  })

  it('refuses a first chunk that resets no dictionary', () => {
    expect(() => decodeLzma2(Uint8Array.of(0x02, 0x00, 0x00, 0x41, 0x00), DICT_64K, 1)).toThrow(
      'The LZMA2 stream starts with a chunk that does not reset the dictionary.',
    )
  })

  it('refuses an LZMA chunk without properties after a dictionary reset', () => {
    const chunk = Uint8Array.of(0x01, 0x00, 0x00, 0x41, 0xa0, 0x00, 0x00, 0x00, 0x04)
    expect(() => decodeLzma2(chunk, DICT_64K, 2)).toThrow(
      'The LZMA2 stream holds an LZMA chunk without properties after a dictionary reset.',
    )
  })

  it('refuses a dictionary property over 40', () => {
    expect(() => decodeLzma2(stream('text'), 41, 3000)).toThrow(
      'The LZMA2 dictionary property 41 is out of range: it must stay at 40 or under.',
    )
  })

  it('refuses an LZMA properties byte of 225 or more', () => {
    const text = stream('text')
    text[5] = 225
    expect(() => decodeLzma2(text, DICT_64K, 3000)).toThrow(
      'The LZMA properties byte 0xe1 is out of range: it must stay under 0xe1.',
    )
  })

  it('refuses LZMA properties whose lc and lp add up to more than 4', () => {
    const text = stream('text')
    text[5] = (0 * 5 + 1) * 9 + 4
    expect(() => decodeLzma2(text, DICT_64K, 3000)).toThrow(
      'The LZMA2 stream sets lc 4 and lp 1; LZMA2 allows 4 for both together.',
    )
  })

  it('refuses a match that reaches past its dictionary', () => {
    expect(() => decodeLzma2(stream('far'), 0, 7000)).toThrow(
      'The LZMA stream holds a match that reaches past its dictionary.',
    )
  })

  it('refuses a stream longer or shorter than the size it should give', () => {
    expect(() => decodeLzma2(stream('text'), DICT_64K, 2999)).toThrow(
      'The LZMA2 stream gives more than 2999 bytes.',
    )
    expect(() => decodeLzma2(stream('text'), DICT_64K, 3001)).toThrow(
      'The LZMA2 stream gives 3000 bytes, not 3001.',
    )
  })
})

describe('decodeLzma2 on chunks made from a raw LZMA stream', () => {
  /** An LZMA chunk that resets everything around the raw stream `lzmaMarker` (3000 bytes and the
   * end marker), claiming `unpacked` bytes. */
  function chunkOfRaw(unpacked: number, extra = new Uint8Array(0)): Uint8Array {
    const raw = joined(fromBase64(LZMA_STREAMS.lzmaMarker), extra)
    const head = Uint8Array.of(0xe0, (unpacked - 1) >> 8, (unpacked - 1) & 0xff, 0, 0, 0x5d)
    head[3] = (raw.length - 1) >> 8
    head[4] = (raw.length - 1) & 0xff
    return joined(head, raw, new Uint8Array(1))
  }

  it('refuses the end marker inside a chunk', () => {
    expect(() => decodeLzma2(chunkOfRaw(3001), DICT_64K, 3001)).toThrow(
      'The LZMA2 stream holds an end marker inside a chunk.',
    )
  })

  it('refuses a match past the end of its chunk', () => {
    expect(() => decodeLzma2(chunkOfRaw(2999), DICT_64K, 2999)).toThrow(
      'The LZMA2 stream holds a match past the end of its chunk.',
    )
  })

  it('refuses a chunk whose coder ends before its packed size', () => {
    const text = stream('text')
    const longer = joined(text.subarray(0, text.length - 1), Uint8Array.of(0, 0))
    longer[4] = (longer[4] as number) + 1
    expect(() => decodeLzma2(longer, DICT_64K, 3000)).toThrow(
      'The LZMA2 stream holds a chunk whose coder does not end at its packed size.',
    )
  })

  it('refuses bytes after the end byte', () => {
    expect(() => decodeLzma2(joined(stream('text'), Uint8Array.of(0)), DICT_64K, 3000)).toThrow(
      'The LZMA2 stream holds 1 bytes after its end.',
    )
  })
})
