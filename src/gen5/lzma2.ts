// LZMA2, the chunked LZMA of 7z's method 0x21. The dictionary property follows "The .xz File
// Format" (xz-file-format.txt, section 5.3.1, by Lasse Collin and Igor Pavlov, public domain); the
// chunks follow the LZMA2 layout as the format is commonly described: a control byte, then for an
// uncompressed chunk its size, for an LZMA chunk its unpacked and packed sizes, the properties
// byte where the chunk sets them, and a range-coded stretch of its own. The symbols inside follow
// lzma-specification.txt (src/gen5/lzma.ts). The code is our own, under the repository's licence.
import { hex, LzmaDecoder, lzmaProperties } from './lzma.ts'
import { RangeDecoder } from './range-decoder.ts'

/** The dictionary size of property `property`: 2 or 3 times a power of two, 4 KiB to 4 GiB. */
function dictionarySize(property: number): number {
  if (property > 40) {
    throw new Error(
      `The LZMA2 dictionary property ${String(property)} is out of range: it must stay at 40 or under.`,
    )
  }
  if (property === 40) return 0xffffffff
  return (2 | (property & 1)) * 2 ** (Math.floor(property / 2) + 11)
}

/** What an LZMA chunk resets, from bits 5 and 6 of its control byte. */
const RESET_STATE = 1
const RESET_PROPERTIES = 2
const RESET_DICTIONARY = 3

/** The control byte of an uncompressed chunk that resets the dictionary first. */
const UNCOMPRESSED_RESET = 1

class ChunkReader {
  private at = 0
  private needDictionary = true
  private needProperties = true

  private readonly input: Uint8Array
  private readonly decoder: LzmaDecoder

  constructor(input: Uint8Array, decoder: LzmaDecoder) {
    this.input = input
    this.decoder = decoder
  }

  /** Reads one chunk into the decoder; false on the end byte. */
  next(): boolean {
    if (this.at >= this.input.length) throw new Error('The LZMA2 stream ends before its end byte.')
    const control = this.input[this.at++] as number
    if (control === 0) return false
    if (control >= 0x80) this.lzma(control)
    else if (control <= 2) this.uncompressed(control)
    else {
      throw new Error(
        `The LZMA2 stream holds the control byte ${hex(control)}, which names no chunk kind.`,
      )
    }
    return true
  }

  /** The bytes after the end byte. */
  get rest(): number {
    return this.input.length - this.at
  }

  private uncompressed(control: number): void {
    const length = this.word(this.take(2)) + 1
    if (control === UNCOMPRESSED_RESET) {
      this.decoder.resetDictionary()
      this.needDictionary = false
      this.needProperties = true
    } else if (this.needDictionary) {
      throw new Error('The LZMA2 stream starts with a chunk that does not reset the dictionary.')
    }
    this.room(length)
    const from = this.take(length)
    this.decoder.copyUncompressed(this.input.subarray(from, from + length))
  }

  private lzma(control: number): void {
    const reset = (control >> 5) & 3
    const head = this.take(reset >= RESET_PROPERTIES ? 5 : 4)
    const unpacked = (control & 0x1f) * 0x10000 + this.word(head) + 1
    const packed = this.word(head + 2) + 1
    this.reset(reset, this.input[head + 4] as number)
    this.room(unpacked)
    const from = this.take(packed)
    const range = new RangeDecoder(this.input, from, from + packed)
    const end = this.decoder.decodeTo(range, this.decoder.position + unpacked)
    if (end === 'marker') throw new Error('The LZMA2 stream holds an end marker inside a chunk.')
    if (end === 'overrun') {
      throw new Error('The LZMA2 stream holds a match past the end of its chunk.')
    }
    if (!range.finished || range.position !== from + packed) {
      throw new Error('The LZMA2 stream holds a chunk whose coder does not end at its packed size.')
    }
  }

  private reset(reset: number, propertiesByte: number): void {
    if (reset === RESET_DICTIONARY) {
      this.decoder.resetDictionary()
      this.needDictionary = false
    } else if (this.needDictionary) {
      throw new Error('The LZMA2 stream starts with a chunk that does not reset the dictionary.')
    }
    if (reset >= RESET_PROPERTIES) {
      const props = lzmaProperties(propertiesByte)
      if (props.lc + props.lp > 4) {
        throw new Error(
          `The LZMA2 stream sets lc ${String(props.lc)} and lp ${String(props.lp)}; LZMA2 allows 4 for both together.`,
        )
      }
      this.decoder.setProperties(props)
      this.needProperties = false
    } else if (this.needProperties) {
      throw new Error(
        'The LZMA2 stream holds an LZMA chunk without properties after a dictionary reset.',
      )
    }
    if (reset >= RESET_STATE) this.decoder.resetState()
  }

  /** Refuses a chunk that would give more bytes than the stream should. */
  private room(length: number): void {
    const size = this.decoder.output.length
    if (this.decoder.position + length > size) {
      throw new Error(`The LZMA2 stream gives more than ${String(size)} bytes.`)
    }
  }

  /** Moves past `count` bytes of the chunk; gives where they start. */
  private take(count: number): number {
    const start = this.at
    if (start + count > this.input.length) throw new Error('The LZMA2 stream ends inside a chunk.')
    this.at += count
    return start
  }

  private word(at: number): number {
    return ((this.input[at] as number) << 8) | (this.input[at + 1] as number)
  }
}

/** Decodes an LZMA2 stream of `size` bytes with the dictionary property `property` (7z's coder
 * property byte). */
export function decodeLzma2(input: Uint8Array, property: number, size: number): Uint8Array {
  const decoder = new LzmaDecoder(size, dictionarySize(property))
  const reader = new ChunkReader(input, decoder)
  while (reader.next());
  if (decoder.position !== size) {
    throw new Error(
      `The LZMA2 stream gives ${String(decoder.position)} bytes, not ${String(size)}.`,
    )
  }
  if (reader.rest > 0)
    throw new Error(`The LZMA2 stream holds ${String(reader.rest)} bytes after its end.`)
  return decoder.output
}
