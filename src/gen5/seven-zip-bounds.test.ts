import { describe, expect, it } from 'vitest'

import { unpack7z } from './seven-zip'
import { build, headerOnly } from './seven-zip.fixtures'

/** 2^26 as a 7z number: three bytes follow, the first byte's low bits give the top. */
const TWO_TO_26 = [0xe4, 0x00, 0x00, 0x00]

/** 2^52 as a 7z number: seven bytes follow. */
const TWO_TO_52 = [0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10]

/** 40 MiB as a 7z number. */
const FORTY_MIB = [0xe2, 0x00, 0x00, 0x80]

/** One LZMA2 coder (property 0x10) as a folder's coders info lists it. */
const LZMA2_CODER = [0x01, 0x21, 0x21, 0x01, 0x10]

/** A spec that ends in microseconds once the count is refused; building an array of 2^26 items
 * first takes seconds and a gigabyte, so this timeout fails a reader that allocates before it
 * checks. */
const FAST_MS = 1000

// Scene: a header of a few bytes names millions of items or petabytes of output. The unpacker
// refuses it with a sentence before it builds anything of that size, so the worker lives to post
// done (review W1).
describe('unpack7z on a header that names more than it holds', () => {
  it(
    'refuses 2^26 files in a header of a few bytes',
    () => {
      expect(() => unpack7z(headerOnly([0x01, 0x05, ...TWO_TO_26, 0x00, 0x00]))).toThrow(
        'The 7z header names 67108864 files, more than its 2 bytes left can hold.',
      )
    },
    FAST_MS,
  )

  it(
    'refuses 2^26 packed streams in a header of a few bytes',
    () => {
      const header = [0x01, 0x04, 0x06, 0x00, ...TWO_TO_26, 0x0a, 0x01, 0x00, 0x00, 0x00]
      expect(() => unpack7z(headerOnly(header))).toThrow(
        'The 7z header names 67108864 packed streams, more than its 5 bytes left can hold.',
      )
    },
    FAST_MS,
  )

  it(
    'refuses 2^26 folders in a header of a few bytes',
    () => {
      const header = [0x01, 0x04, 0x07, 0x0b, ...TWO_TO_26, 0x00, 0x00, 0x00, 0x00]
      expect(() => unpack7z(headerOnly(header))).toThrow(
        'The 7z header names 67108864 folders, more than its 4 bytes left can hold.',
      )
    },
    FAST_MS,
  )

  it(
    'refuses 2^26 coders in a folder of a few bytes',
    () => {
      const header = [0x01, 0x04, 0x07, 0x0b, 0x01, 0x00, ...TWO_TO_26, 0x00, 0x00]
      expect(() => unpack7z(headerOnly(header))).toThrow(
        'The 7z header names 67108864 coders, more than its 2 bytes left can hold.',
      )
    },
    FAST_MS,
  )

  it(
    'refuses a folder that unpacks to 2^52 bytes',
    () => {
      const header = [
        ...[0x01, 0x04, 0x06, 0x00, 0x01, 0x09, 0x01, 0x00],
        ...[0x07, 0x0b, 0x01, 0x00, ...LZMA2_CODER, 0x0c, ...TWO_TO_52, 0x00, 0x00, 0x00],
      ]
      expect(() => unpack7z(build(Uint8Array.of(0x00), header))).toThrow(
        "The 7z header's folders unpack to 4503599627370496 bytes, more than the 67108864 this unpacker allows.",
      )
    },
    FAST_MS,
  )

  it(
    'refuses two folders that together unpack to more than the limit',
    () => {
      const header = [
        ...[0x01, 0x04, 0x06, 0x00, 0x02, 0x09, 0x01, 0x01, 0x00],
        ...[0x07, 0x0b, 0x02, 0x00, ...LZMA2_CODER, ...LZMA2_CODER],
        ...[0x0c, ...FORTY_MIB, ...FORTY_MIB, 0x00, 0x00, 0x00],
      ]
      expect(() => unpack7z(build(Uint8Array.of(0x00, 0x00), header))).toThrow(
        "The 7z header's folders unpack to 83886080 bytes, more than the 67108864 this unpacker allows.",
      )
    },
    FAST_MS,
  )
})
