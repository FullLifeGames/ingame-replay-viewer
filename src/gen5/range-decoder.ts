// The range decoder of LZMA, after Igor Pavlov's "LZMA specification" (lzma-specification.txt in
// the LZMA SDK, public domain), section "Range Decoder" and "The Bit Decoding with Probability
// Model". The code is our own, under the repository's licence. It reads one stretch of bytes and
// throws at its end instead of reading past it.

/** Range is kept at 2^24 or over before each bit. */
const TOP = 1 << 24

/** A probability counter holds 11 bits; it moves by 1/32 of its distance after each bit. */
const MODEL_BITS = 11
const MOVE_BITS = 5

/** Where a probability counter starts: an even chance for 0 and 1. */
export const PROBABILITY_START = (1 << MODEL_BITS) >>> 1

export class RangeDecoder {
  private range = 0xffffffff
  private code = 0
  private at: number
  private readonly input: Uint8Array
  private readonly end: number

  /** Starts on `input` from `start` up to `end`: a zero byte, then four bytes of the code. */
  constructor(input: Uint8Array, start: number, end: number) {
    this.input = input
    this.end = end
    if (start >= end) throw new Error('The LZMA stream ends early.')
    if (input[start] !== 0) throw new Error('The LZMA stream does not start with a zero byte.')
    this.at = start + 1
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0
  }

  /** Where the next byte would be read. */
  get position(): number {
    return this.at
  }

  /** True when the code has come down to zero, as it does after the encoder's last bit. */
  get finished(): boolean {
    return this.code === 0
  }

  /** One bit with the counter `probs[index]`, which it moves toward the bit it gives. */
  bit(probs: Uint16Array, index: number): number {
    const probability = probs[index] as number
    const bound = (this.range >>> MODEL_BITS) * probability
    let bit = 0
    if (this.code < bound) {
      this.range = bound
      probs[index] = probability + (((1 << MODEL_BITS) - probability) >>> MOVE_BITS)
    } else {
      this.range -= bound
      this.code -= bound
      probs[index] = probability - (probability >>> MOVE_BITS)
      bit = 1
    }
    if (this.range < TOP) this.shift()
    return bit
  }

  /** `count` bits of even chance, the highest first. */
  direct(count: number): number {
    let value = 0
    for (let i = 0; i < count; i++) {
      this.range >>>= 1
      let bit = 0
      if (this.code >= this.range) {
        this.code -= this.range
        bit = 1
      }
      value = value * 2 + bit
      if (this.range < TOP) this.shift()
    }
    return value
  }

  /** A value of `bits` bits from a binary tree of counters at `probs[offset + 1]` on, the highest
   * bit first. */
  tree(probs: Uint16Array, offset: number, bits: number): number {
    let node = 1
    for (let i = 0; i < bits; i++) node = (node << 1) | this.bit(probs, offset + node)
    return node - (1 << bits)
  }

  /** The same tree read the other way: the lowest bit first. */
  reverse(probs: Uint16Array, offset: number, bits: number): number {
    let node = 1
    let value = 0
    for (let i = 0; i < bits; i++) {
      const bit = this.bit(probs, offset + node)
      node = (node << 1) | bit
      value |= bit << i
    }
    return value
  }

  private shift(): void {
    this.range = (this.range << 8) >>> 0
    this.code = ((this.code << 8) | this.next()) >>> 0
  }

  private next(): number {
    if (this.at >= this.end) throw new Error('The LZMA stream ends early.')
    return this.input[this.at++] as number
  }
}
