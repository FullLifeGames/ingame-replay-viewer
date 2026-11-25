// Writes into DS main RAM for the Gen 5 spike (#72, #97): a run of bytes, some bits of one byte,
// or a copy of bytes from one place to another, each at a fixed address or behind pointers
// (ram-chain.ts), turned into the 32-bit words the page can write. Pure: the page hands in a word
// reader over the core's heap and writes the words it gets back (src/web/gen5/frame-hook.ts).
import { chainAddress, type PointerChain } from './ram-chain.ts'

/** A write of whole bytes, of `mask`'s bits in one byte keeping the byte's other bits, or a copy
 * of `length` bytes. The bytes and the chains are plain numbers, so a write crosses into the page
 * as JSON. */
export type MemoryWrite =
  | ({ kind: 'bytes'; field: string; bytes: readonly number[] } & PointerChain)
  | ({ kind: 'bits'; field: string; mask: number; value: number } & PointerChain)
  | { kind: 'copy'; field: string; from: PointerChain; to: PointerChain; length: number }

/** The `size` bytes of `value`, lowest first; throws when it does not fit them unsigned. */
export function littleEndian(value: number, size: number, field: string): number[] {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** (size * 8)) {
    throw new RangeError(`${field} cannot hold ${String(value)} in ${String(size)} bytes`)
  }
  return Array.from({ length: size }, (_, i) => Math.floor(value / 2 ** (i * 8)) % 256)
}

type CopyWrite = Extract<MemoryWrite, { kind: 'copy' }>

/** The words to write, or why the write leads out of main RAM. */
export type WordWrites = { words: { address: number; value: number }[] } | { fault: string }

interface ByteChange {
  address: number
  mask: number
  value: number
}

type Changes = { changes: ByteChange[] } | { fault: string }

/** The byte of main RAM at `address`, out of its aligned word. */
const byteAt = (address: number, readWord: (address: number) => number) =>
  (readWord(address - (address % 4)) >>> ((address % 4) * 8)) & 0xff

/** The bytes a bytes or bits write changes, counted from its first byte; throws on a value that
 * does not fit. */
function ownChanges(write: Exclude<MemoryWrite, CopyWrite>): ByteChange[] {
  if (write.kind === 'bytes') {
    return write.bytes.map((value, i) => {
      if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new RangeError(`${write.field}: byte ${String(i)} is ${String(value)}`)
      }
      return { address: i, mask: 0xff, value }
    })
  }
  if ((write.value & ~write.mask) !== 0 || write.mask > 0xff || write.value < 0) {
    throw new RangeError(`${write.field}: ${String(write.value)} lies outside the mask`)
  }
  return [{ address: 0, mask: write.mask, value: write.value }]
}

/** The source's bytes onto the destination, both chains resolved before any byte is read. */
function copyChanges(write: CopyWrite, readWord: (address: number) => number): Changes {
  const { field, length } = write
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`${field}: a copy of ${String(length)} bytes`)
  }
  const from = chainAddress(`${field} from`, write.from, length, readWord)
  if ('fault' in from) return from
  const to = chainAddress(`${field} to`, write.to, length, readWord)
  if ('fault' in to) return to
  if (from.address < to.address + length && to.address < from.address + length) {
    return { fault: `${field}: its source and destination overlap` }
  }
  const changes = Array.from({ length }, (_, i) => ({
    address: to.address + i,
    mask: 0xff,
    value: byteAt(from.address + i, readWord),
  }))
  return { changes }
}

/** The bytes `write` changes by address, once its chain is resolved. */
function byteChanges(write: MemoryWrite, readWord: (address: number) => number): Changes {
  if (write.kind === 'copy') return copyChanges(write, readWord)
  const own = ownChanges(write)
  const end = chainAddress(write.field, write, own.length, readWord)
  if ('fault' in end) return end
  return { changes: own.map((change) => ({ ...change, address: end.address + change.address })) }
}

/** The aligned words that carry `write`, each read first and changed only where it writes; or the
 * fault of a chain that leads out of main RAM, with no word to write. */
export function wordWrites(write: MemoryWrite, readWord: (address: number) => number): WordWrites {
  const changes = byteChanges(write, readWord)
  if ('fault' in changes) return changes
  const words = new Map<number, number>()
  for (const change of changes.changes) {
    const at = change.address - (change.address % 4)
    const shift = (change.address % 4) * 8
    const word = words.get(at) ?? readWord(at)
    const mask = (change.mask << shift) >>> 0
    words.set(at, ((word & ~mask) | ((change.value << shift) & mask)) >>> 0)
  }
  return { words: [...words].map(([address, value]) => ({ address, value })) }
}
