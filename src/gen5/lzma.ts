// LZMA, after Igor Pavlov's "LZMA specification" (lzma-specification.txt in the LZMA SDK, public
// domain): the literal, match and repeated-match symbols, their lengths and distances, and the
// dictionary they copy from. The code is our own, under the repository's licence. The decoder
// writes into one array of the stream's full size, which is also its dictionary: a reset of the
// dictionary moves the point that matches may not reach behind.
import { PROBABILITY_START, RangeDecoder } from './range-decoder.ts'

/** The three numbers of LZMA's properties byte: literal context bits, literal position bits and
 * position bits. */
export interface LzmaProperties {
  lc: number
  lp: number
  pb: number
}

/** The properties byte holds (pb * 5 + lp) * 9 + lc. */
export function lzmaProperties(byte: number): LzmaProperties {
  if (byte >= 225) {
    throw new Error(
      `The LZMA properties byte ${hex(byte)} is out of range: it must stay under 0xe1.`,
    )
  }
  return { lc: byte % 9, lp: Math.floor(byte / 9) % 5, pb: Math.floor(byte / 45) }
}

/** The byte as 0x and two hex digits, for a sentence. */
export function hex(byte: number): string {
  return `0x${byte.toString(16).padStart(2, '0')}`
}

// The counters other than the literals', in one array: 12 states, 16 position states at most.
const IS_MATCH = 0
const IS_REP = 192
const IS_REP_G0 = 204
const IS_REP_G1 = 216
const IS_REP_G2 = 228
const IS_REP0_LONG = 240
const POS_SLOT = 432
const POS_SPECIAL = 688
const ALIGN = 803
/** A length coder: two choice counters, eight trees of 3 bits, eight more, one tree of 8 bits. */
const LENGTH = 819
const REP_LENGTH = 1333
const COUNTERS = 1847
const LENGTH_MID = 130
const LENGTH_HIGH = 258

/** The distance of the end marker: 2^32 - 1. */
const MARKER = 0xffffffff
const MIN_MATCH = 2

/** How a run of symbols ended: at its end, on the end marker, or on a symbol past its end. */
export type RunEnd = 'done' | 'marker' | 'overrun'

export class LzmaDecoder {
  readonly output: Uint8Array
  position = 0
  private start = 0
  private props: LzmaProperties = { lc: 0, lp: 0, pb: 0 }
  private readonly counters = new Uint16Array(COUNTERS)
  private literals = new Uint16Array(0x300)
  private state = 0
  private rep0 = 0
  private rep1 = 0
  private rep2 = 0
  private rep3 = 0

  private readonly dictionarySize: number

  /** A decoder for `size` bytes whose matches reach back `dictionarySize` bytes at most. */
  constructor(size: number, dictionarySize: number) {
    this.output = new Uint8Array(size)
    this.dictionarySize = dictionarySize
  }

  /** From here on, no match reaches behind the current position. */
  resetDictionary(): void {
    this.start = this.position
  }

  setProperties(props: LzmaProperties): void {
    this.props = props
    this.literals = new Uint16Array(0x300 << (props.lc + props.lp))
  }

  /** Every counter back to an even chance, the state and the four distances back to zero. */
  resetState(): void {
    this.counters.fill(PROBABILITY_START)
    this.literals.fill(PROBABILITY_START)
    this.state = 0
    this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0
  }

  /** Takes `bytes` into the output and the dictionary as they are. */
  copyUncompressed(bytes: Uint8Array): void {
    this.output.set(bytes, this.position)
    this.position += bytes.length
  }

  /** Decodes symbols until the output reaches `end`. */
  decodeTo(range: RangeDecoder, end: number): RunEnd {
    while (this.position < end) {
      const room = end - this.position
      const added = this.symbol(range, room)
      if (added === 0) return 'marker'
      if (added > room) return 'overrun'
    }
    return 'done'
  }

  /** True when the next symbol is the end marker. */
  endMarker(range: RangeDecoder): boolean {
    return this.symbol(range, 0) === 0
  }

  /** One symbol: the bytes it adds, 0 for the end marker. A symbol longer than `room` adds
   * nothing and gives its length, for the caller to refuse. */
  private symbol(range: RangeDecoder, room: number): number {
    const posState = (this.position - this.start) & ((1 << this.props.pb) - 1)
    const counters = this.counters
    if (range.bit(counters, IS_MATCH + (this.state << 4) + posState) === 0) {
      return this.literal(range, room)
    }
    const length =
      range.bit(counters, IS_REP + this.state) === 0
        ? this.match(range, posState)
        : this.repeat(range, posState)
    if (length !== 0 && length <= room) this.copy(length)
    return length
  }

  private literal(range: RangeDecoder, room: number): number {
    if (room < 1) return 1
    const { lc, lp } = this.props
    const total = this.position - this.start
    const previous = total > 0 ? (this.output[this.position - 1] as number) : 0
    const base = 0x300 * (((total & ((1 << lp) - 1)) << lc) + (previous >> (8 - lc)))
    let symbol = this.state >= 7 ? this.matchedLiteral(range, base) : 1
    while (symbol < 0x100) symbol = (symbol << 1) | range.bit(this.literals, base + symbol)
    this.output[this.position++] = symbol - 0x100
    this.state = this.state < 4 ? 0 : this.state < 10 ? this.state - 3 : this.state - 6
    return 1
  }

  /** After a match, a literal is read beside the byte at the last distance until they differ. */
  private matchedLiteral(range: RangeDecoder, base: number): number {
    let matchByte = this.output[this.position - this.rep0 - 1] as number
    let symbol = 1
    while (symbol < 0x100) {
      const matchBit = (matchByte >> 7) & 1
      matchByte <<= 1
      const bit = range.bit(this.literals, base + ((1 + matchBit) << 8) + symbol)
      symbol = (symbol << 1) | bit
      if (matchBit !== bit) break
    }
    return symbol
  }

  /** A match with a new distance: its length, or 0 for the end marker. */
  private match(range: RangeDecoder, posState: number): number {
    this.rep3 = this.rep2
    this.rep2 = this.rep1
    this.rep1 = this.rep0
    const length = this.length(range, LENGTH, posState)
    this.state = this.state < 7 ? 7 : 10
    this.rep0 = this.distance(range, length)
    return this.rep0 === MARKER ? 0 : length + MIN_MATCH
  }

  /** A match at one of the last four distances, or one byte at the last one. */
  private repeat(range: RangeDecoder, posState: number): number {
    if (this.position === this.start) {
      throw new Error('The LZMA stream repeats a match before its first byte.')
    }
    const counters = this.counters
    if (range.bit(counters, IS_REP_G0 + this.state) === 0) {
      if (range.bit(counters, IS_REP0_LONG + (this.state << 4) + posState) === 0) {
        this.state = this.state < 7 ? 9 : 11
        return 1
      }
    } else {
      this.takeOlderDistance(range)
    }
    this.state = this.state < 7 ? 8 : 11
    return this.length(range, REP_LENGTH, posState) + MIN_MATCH
  }

  /** Brings the second, third or fourth distance to the front. */
  private takeOlderDistance(range: RangeDecoder): void {
    let distance = this.rep1
    if (range.bit(this.counters, IS_REP_G1 + this.state) !== 0) {
      if (range.bit(this.counters, IS_REP_G2 + this.state) === 0) {
        distance = this.rep2
      } else {
        distance = this.rep3
        this.rep3 = this.rep2
      }
      this.rep2 = this.rep1
    }
    this.rep1 = this.rep0
    this.rep0 = distance
  }

  /** A match's length less two, from the length coder at `offset`. */
  private length(range: RangeDecoder, offset: number, posState: number): number {
    const counters = this.counters
    if (range.bit(counters, offset) === 0) return range.tree(counters, offset + 2 + posState * 8, 3)
    if (range.bit(counters, offset + 1) === 0) {
      return 8 + range.tree(counters, offset + LENGTH_MID + posState * 8, 3)
    }
    return 16 + range.tree(counters, offset + LENGTH_HIGH, 8)
  }

  /** A match's distance less one: a slot of 6 bits, then the bits below the slot's top two. */
  private distance(range: RangeDecoder, length: number): number {
    const counters = this.counters
    const slot = range.tree(counters, POS_SLOT + (Math.min(length, 3) << 6), 6)
    if (slot < 4) return slot
    const bits = (slot >> 1) - 1
    const base = (2 | (slot & 1)) * 2 ** bits
    if (slot < 14) return base + range.reverse(counters, POS_SPECIAL + base - slot, bits)
    return base + range.direct(bits - 4) * 16 + range.reverse(counters, ALIGN, 4)
  }

  private copy(length: number): void {
    const distance = this.rep0
    if (distance >= this.position - this.start || distance >= this.dictionarySize) {
      throw new Error('The LZMA stream holds a match that reaches past its dictionary.')
    }
    const output = this.output
    let from = this.position - distance - 1
    let to = this.position
    const end = to + length
    while (to < end) output[to++] = output[from++] as number
    this.position = end
  }
}

/** The smallest dictionary LZMA uses; a smaller size in the properties counts as this one. */
const MIN_DICTIONARY = 1 << 12

/** Decodes a raw LZMA stream of `size` bytes, with or without the end marker after them, as 7z's
 * method LZMA stores it: `properties` is the properties byte and the dictionary size (4 bytes,
 * little-endian). */
export function decodeLzma(input: Uint8Array, properties: Uint8Array, size: number): Uint8Array {
  if (properties.length !== 5) {
    throw new Error(`The LZMA coder holds ${String(properties.length)} property bytes; it needs 5.`)
  }
  const dictionary = new DataView(properties.buffer, properties.byteOffset).getUint32(1, true)
  const decoder = new LzmaDecoder(size, Math.max(dictionary, MIN_DICTIONARY))
  decoder.setProperties(lzmaProperties(properties[0] as number))
  decoder.resetState()
  const range = new RangeDecoder(input, 0, input.length)
  const end = decoder.decodeTo(range, size)
  if (end === 'marker') {
    throw new Error(
      `The LZMA stream ends with its marker after ${String(decoder.position)} of ${String(size)} bytes.`,
    )
  }
  if (end === 'overrun' || !(range.finished || decoder.endMarker(range))) {
    throw new Error(`The LZMA stream holds more than its ${String(size)} bytes.`)
  }
  if (!range.finished) throw new Error('The LZMA stream does not end where its coder does.')
  return decoder.output
}
