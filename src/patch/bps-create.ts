// Creates a BPS patch from a source and a target: greedy and deterministic. At each target byte it
// takes the longest of three matches, and bytes that match nothing go into a TargetRead:
// - SourceRead: the source holds the same bytes at the same offset;
// - a run of one byte: one byte through TargetRead, then a TargetCopy of the byte before itself,
//   so the ROM's 0xFF padding and the zero-filled replay slot cost a few bytes;
// - SourceCopy: the source holds the bytes elsewhere, found through an index of 8-byte grams.
import { BPS_MAGIC, BpsAction, ByteWriter } from './bps-format.ts'
import { crc32 } from './crc32.ts'

const GRAM = 8
const MIN_MATCH = GRAM
const MIN_RUN = 16
const CHAIN_LIMIT = 64
const MIN_INDEX_BITS = 10
const MAX_INDEX_BITS = 22

interface Match {
  action: BpsAction
  length: number
  from: number
}

interface GramIndex {
  bits: number
  head: Int32Array
  next: Int32Array
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

// A gram of one repeated byte. The index leaves these out, as runs have their own match.
function isRunGram(view: DataView, at: number): boolean {
  const low = view.getUint32(at, true)
  return low === view.getUint32(at + 4, true) && low === (low & 0xff) * 0x01010101
}

function gramHash(view: DataView, at: number, bits: number): number {
  const mixed =
    Math.imul(view.getUint32(at, true), 0x9e3779b1) ^
    Math.imul(view.getUint32(at + 4, true), 0x85ebca77)
  return Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d) >>> (32 - bits)
}

// Chains run from the latest source offset back to the first, so the search is deterministic.
function indexGrams(source: Uint8Array): GramIndex {
  const bits = Math.min(
    MAX_INDEX_BITS,
    Math.max(MIN_INDEX_BITS, Math.ceil(Math.log2(source.length + 1))),
  )
  const head = new Int32Array(1 << bits).fill(-1)
  const next = new Int32Array(Math.max(0, source.length - GRAM + 1))
  const view = viewOf(source)
  for (let at = 0; at < next.length; at++) {
    if (isRunGram(view, at)) continue
    const hash = gramHash(view, at, bits)
    next[at] = head[hash] as number
    head[hash] = at
  }
  return { bits, head, next }
}

function matchLength(source: Uint8Array, from: number, target: Uint8Array, at: number): number {
  const limit = Math.min(source.length - from, target.length - at)
  let length = 0
  while (length < limit && source[from + length] === target[at + length]) length++
  return length
}

function runLength(target: Uint8Array, at: number): number {
  const byte = target[at]
  let length = 1
  while (at + length < target.length && target[at + length] === byte) length++
  return length
}

class Encoder {
  readonly writer = new ByteWriter()
  readonly source: Uint8Array
  readonly target: Uint8Array
  readonly index: GramIndex
  readonly targetView: DataView
  sourceOffset = 0
  targetOffset = 0

  constructor(source: Uint8Array, target: Uint8Array) {
    this.source = source
    this.target = target
    this.index = indexGrams(source)
    this.targetView = viewOf(target)
  }

  encode(): Uint8Array {
    const { writer, source, target } = this
    writer.pushBytes(BPS_MAGIC)
    writer.pushNumber(source.length)
    writer.pushNumber(target.length)
    writer.pushNumber(0)
    this.commands()
    writer.pushUint32(crc32(source))
    writer.pushUint32(crc32(target))
    writer.pushUint32(crc32(writer.finish()))
    return writer.finish()
  }

  commands(): void {
    let pending = 0
    let at = 0
    while (at < this.target.length) {
      const match = this.bestMatch(at)
      if (match === undefined) {
        at++
        continue
      }
      // A run keeps its first byte in the TargetRead and copies it into the rest.
      const literalEnd = match.action === BpsAction.TargetCopy ? at + 1 : at
      this.targetRead(pending, literalEnd)
      this.emit(match)
      at = literalEnd + match.length
      pending = at
    }
    this.targetRead(pending, this.target.length)
  }

  bestMatch(at: number): Match | undefined {
    const read = at < this.source.length ? matchLength(this.source, at, this.target, at) : 0
    let best: Match | undefined =
      read >= MIN_MATCH ? { action: BpsAction.SourceRead, length: read, from: at } : undefined
    const copy = this.sourceCopy(at, best?.length ?? MIN_MATCH - 1)
    if (copy !== undefined) best = copy
    const run = runLength(this.target, at)
    if (run >= MIN_RUN && run - 1 > (best?.length ?? 0)) {
      best = { action: BpsAction.TargetCopy, length: run - 1, from: at }
    }
    return best
  }

  // The longest source match above `shorter` along the gram's chain, or nothing.
  sourceCopy(at: number, shorter: number): Match | undefined {
    if (at + GRAM > this.target.length || isRunGram(this.targetView, at)) return undefined
    const { source, target, index } = this
    let candidate = index.head[gramHash(this.targetView, at, index.bits)] as number
    let best: Match | undefined
    let longest = shorter
    for (let step = 0; candidate >= 0 && step < CHAIN_LIMIT; step++) {
      if (source[candidate + longest] === target[at + longest]) {
        const length = matchLength(source, candidate, target, at)
        if (length > longest) {
          best = { action: BpsAction.SourceCopy, length, from: candidate }
          longest = length
        }
      }
      candidate = index.next[candidate] as number
    }
    return best
  }

  emit({ action, length, from }: Match): void {
    this.writer.pushNumber((length - 1) * 4 + action)
    if (action === BpsAction.SourceCopy) {
      this.pushOffset(from - this.sourceOffset)
      this.sourceOffset = from + length
    }
    if (action === BpsAction.TargetCopy) {
      this.pushOffset(from - this.targetOffset)
      this.targetOffset = from + length
    }
  }

  targetRead(start: number, end: number): void {
    if (end <= start) return
    this.writer.pushNumber((end - start - 1) * 4 + BpsAction.TargetRead)
    this.writer.pushBytes(this.target.subarray(start, end))
  }

  pushOffset(delta: number): void {
    this.writer.pushNumber(Math.abs(delta) * 2 + (delta < 0 ? 1 : 0))
  }
}

export function createBps(source: Uint8Array, target: Uint8Array): Uint8Array {
  return new Encoder(source, target).encode()
}
