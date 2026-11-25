// Writes into DS main RAM for the Gen 5 spike (#72): a run of bytes, or some bits of one byte,
// turned into the 32-bit words the page can write. Pure: the page hands in a word reader over
// the core's heap and writes the words it gets back (src/web/gen5/frame-hook.ts).

/** A write of whole bytes, or of `mask`'s bits in one byte, keeping the byte's other bits. The
 * bytes are plain numbers, so a write crosses into the page as JSON. */
export type MemoryWrite =
  | { kind: 'bytes'; field: string; address: number; bytes: readonly number[] }
  | { kind: 'bits'; field: string; address: number; mask: number; value: number }

/** The bytes of `write` by address, or for a bits write the byte's mask and value. */
function byteChanges(write: MemoryWrite): { address: number; mask: number; value: number }[] {
  if (write.kind === 'bytes') {
    return write.bytes.map((value, i) => {
      if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new RangeError(`${write.field}: byte ${String(i)} is ${String(value)}`)
      }
      return { address: write.address + i, mask: 0xff, value }
    })
  }
  if ((write.value & ~write.mask) !== 0 || write.mask > 0xff || write.value < 0) {
    throw new RangeError(`${write.field}: ${String(write.value)} lies outside the mask`)
  }
  return [{ address: write.address, mask: write.mask, value: write.value }]
}

/** The aligned words that carry `write`, each read first and changed only where it writes. */
export function wordWrites(
  write: MemoryWrite,
  readWord: (address: number) => number,
): { address: number; value: number }[] {
  const words = new Map<number, number>()
  for (const change of byteChanges(write)) {
    const at = change.address - (change.address % 4)
    const shift = (change.address % 4) * 8
    const word = words.get(at) ?? readWord(at)
    const mask = (change.mask << shift) >>> 0
    words.set(at, ((word & ~mask) | ((change.value << shift) & mask)) >>> 0)
  }
  return [...words].map(([address, value]) => ({ address, value }))
}
