// The byte reader of the 7z header, after 7zFormat.txt (LZMA SDK, public domain), section "Notes
// about Notation and encoding": little-endian numbers, the variable-length UINT64, and bit
// vectors with the first item in the highest bit. The code is our own, under the repository's
// licence.

export class ByteReader {
  private at = 0
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  byte(): number {
    if (this.at >= this.bytes.length) throw new Error('The 7z header ends early.')
    return this.bytes[this.at++] as number
  }

  /** A UINT64: the first byte's leading ones count the bytes that follow, its other bits are the
   * value's top. */
  number(): number {
    const first = this.byte()
    let value = 0
    let i = 0
    for (; i < 8 && (first & (0x80 >> i)) !== 0; i++) value += this.byte() * 2 ** (8 * i)
    if (i < 8) value += (first & ((0x80 >> i) - 1)) * 2 ** (8 * i)
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new Error('The 7z header holds a number past what this unpacker reads.')
    }
    return value
  }

  uint32(): number {
    let value = 0
    for (let i = 0; i < 4; i++) value += this.byte() * 2 ** (8 * i)
    return value
  }

  take(count: number): Uint8Array {
    if (this.at + count > this.bytes.length) throw new Error('The 7z header ends early.')
    this.at += count
    return this.bytes.subarray(this.at - count, this.at)
  }

  /** `count` flags, eight to a byte, the first in the highest bit. */
  bits(count: number): boolean[] {
    const bytes = this.take(Math.ceil(count / 8))
    return Array.from(
      { length: count },
      (_, i) => (((bytes[i >> 3] as number) >> (7 - (i & 7))) & 1) === 1,
    )
  }

  /** A byte that says all `count` items are defined, or else a bit vector of the defined ones. */
  defined(count: number): boolean[] {
    return this.byte() !== 0 ? new Array<boolean>(count).fill(true) : this.bits(count)
  }

  /** CRCs for the defined items of `count`; undefined for the others. */
  digests(count: number): (number | undefined)[] {
    return this.defined(count).map((defined) => (defined ? this.uint32() : undefined))
  }
}
