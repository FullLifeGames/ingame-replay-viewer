// The BPS patch format (byuu's `bps_spec.md`, public domain): the magic, the four actions, the
// footer, and the variable-length numbers. Both the encoder and the decoder build on this module.
export const BPS_MAGIC = new Uint8Array([0x42, 0x50, 0x53, 0x31]) // "BPS1"

// Three CRC-32 values close every patch: source, target, patch.
export const BPS_FOOTER_SIZE = 12

export const BpsAction = {
  SourceRead: 0,
  TargetRead: 1,
  SourceCopy: 2,
  TargetCopy: 3,
} as const
export type BpsAction = (typeof BpsAction)[keyof typeof BpsAction]

export class BpsError extends Error {
  override name = 'BpsError'
}

const FIRST_CAPACITY = 1 << 16

// A growing byte buffer for the encoder.
export class ByteWriter {
  #buffer = new Uint8Array(FIRST_CAPACITY)
  #length = 0

  get length(): number {
    return this.#length
  }

  pushByte(byte: number): void {
    this.#reserve(1)
    this.#buffer[this.#length++] = byte
  }

  pushBytes(bytes: Uint8Array): void {
    this.#reserve(bytes.length)
    this.#buffer.set(bytes, this.#length)
    this.#length += bytes.length
  }

  // The spec's number: seven bits per byte, the high bit ends the number, and each further byte
  // counts from one past the last, so every value has exactly one encoding.
  pushNumber(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new BpsError(`BPS: ${String(value)} is not a size`)
    let rest = value
    for (;;) {
      const low = rest % 128
      rest = Math.floor(rest / 128)
      if (rest === 0) {
        this.pushByte(0x80 | low)
        return
      }
      this.pushByte(low)
      rest--
    }
  }

  pushUint32(value: number): void {
    for (let shift = 0; shift < 32; shift += 8) this.pushByte((value >>> shift) & 0xff)
  }

  finish(): Uint8Array {
    return this.#buffer.slice(0, this.#length)
  }

  #reserve(extra: number): void {
    if (this.#length + extra <= this.#buffer.length) return
    let capacity = this.#buffer.length * 2
    while (capacity < this.#length + extra) capacity *= 2
    const grown = new Uint8Array(capacity)
    grown.set(this.#buffer.subarray(0, this.#length))
    this.#buffer = grown
  }
}

// Reads numbers and byte runs from one area of a patch, `[offset, end)`, and refuses to leave it.
export class PatchReader {
  offset = 0
  readonly bytes: Uint8Array
  readonly end: number

  constructor(bytes: Uint8Array, end: number) {
    this.bytes = bytes
    this.end = end
  }

  number(): number {
    let value = 0
    let shift = 1
    for (;;) {
      if (this.offset >= this.end)
        throw new BpsError('BPS: a number runs past the end of the patch')
      const byte = this.bytes[this.offset++] as number
      value += (byte & 0x7f) * shift
      if (value > Number.MAX_SAFE_INTEGER) throw new BpsError('BPS: number too large')
      if (byte & 0x80) return value
      shift *= 128
      value += shift
    }
  }

  take(length: number): Uint8Array {
    if (length > this.end - this.offset)
      throw new BpsError('BPS: a TargetRead runs past the end of the patch')
    const bytes = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return bytes
  }
}

export function readUint32(bytes: Uint8Array, offset: number): number {
  let value = 0
  for (let index = 3; index >= 0; index--) value = value * 256 + (bytes[offset + index] as number)
  return value
}
