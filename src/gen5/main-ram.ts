// DS main RAM inside a running emulator core's heap (#72). The core exposes no memory call, so
// the page finds the 4 MB by content, from facts in GBATEK and the cartridge header: the boot
// code leaves a copy of the header at 0x027FFE00 (a mirror of main RAM offset 0x3FFE00), and the
// ARM9 binary sits at its RAM address from the header. The core's copy of the ROM starts with
// the same header bytes, so a hit counts only when the ARM9 bytes sit at their distance too.
// Every read and write goes through a getter for the heap: a grown wasm memory replaces it.

/** DS main RAM: 4 MB at 0x02000000 (GBATEK, "DS Memory Map"). */
export const MAIN_RAM_START = 0x02000000
export const MAIN_RAM_SIZE = 0x400000

/** True when all `length` bytes from `address` on lie in DS main RAM: the one rule every part of
 * the spike asks. */
export function inMainRam(address: number, length = 1): boolean {
  return address >= MAIN_RAM_START && address + length <= MAIN_RAM_START + MAIN_RAM_SIZE
}

/** The boot code's header copy, GBATEK's 0x027FFE00, which mirrors this main RAM offset. */
export const HEADER_COPY_OFFSET = 0x3ffe00

/** The header bytes the scan looks for: title, game code, maker, unit code and the rest to 0x20. */
export const HEADER_PROBE_SIZE = 0x20

/** The ARM9 binary's first 2 KB, the secure area, which the boot rewrites; the probe starts past it. */
export const SECURE_AREA_SIZE = 0x800

/** The bytes of the ARM9 binary the scan compares, from SECURE_AREA_SIZE on. */
export const ARM9_PROBE_SIZE = 0x100

/** Header hits kept for the log; the scan still checks every hit. */
const HITS_KEPT = 16

export interface MainRamFacts {
  /** The cartridge header's first HEADER_PROBE_SIZE bytes, from the dump. */
  header: Uint8Array
  arm9RamAddress: number
  /** ARM9_PROBE_SIZE bytes of the ARM9 binary from SECURE_AREA_SIZE on, from the dump. */
  arm9Probe: Uint8Array
}

export interface MainRamScan {
  /** The heap offset of main RAM's first byte, when exactly one candidate holds both facts. */
  base: number | undefined
  /** Every candidate that holds both facts. */
  bases: number[]
  /** Heap offsets of the header bytes, the first HITS_KEPT of them. */
  headerHits: number[]
  heapBytes: number
}

export interface MainRam {
  base: number
  read32: (address: number) => number
  write32: (address: number, value: number) => void
  /** A copy of `length` bytes from `address` on. */
  read: (address: number, length: number) => Uint8Array
}

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

/** The main RAM offset of `address`; throws unless all `length` bytes lie in main RAM. */
function ramOffset(address: number, length: number): number {
  if (!inMainRam(address, length)) {
    const last = hex(MAIN_RAM_START + MAIN_RAM_SIZE - 1)
    throw new RangeError(
      `${hex(address)} lies outside DS main RAM (${hex(MAIN_RAM_START)} to ${last}).`,
    )
  }
  return address - MAIN_RAM_START
}

const sameBytes = (heap: Uint8Array, at: number, bytes: Uint8Array) =>
  bytes.every((byte, i) => heap[at + i] === byte)

/** True when `base` holds main RAM: the header copy and the ARM9 bytes at their distances. */
function holdsMainRam(heap: Uint8Array, base: number, facts: MainRamFacts): boolean {
  if (base < 0 || base + MAIN_RAM_SIZE > heap.length) return false
  const arm9At = base + ramOffset(facts.arm9RamAddress + SECURE_AREA_SIZE, ARM9_PROBE_SIZE)
  return (
    sameBytes(heap, base + HEADER_COPY_OFFSET, facts.header) &&
    sameBytes(heap, arm9At, facts.arm9Probe)
  )
}

/** Scans 4-byte aligned offsets for the header bytes and checks each hit as a header copy. */
export function scanForMainRam(heap: Uint8Array, facts: MainRamFacts): MainRamScan {
  const words = new Uint32Array(heap.buffer, heap.byteOffset, heap.byteLength >>> 2)
  const first = new DataView(facts.header.buffer, facts.header.byteOffset).getUint32(0, true)
  const headerHits: number[] = []
  const bases: number[] = []
  for (let i = 0; i < words.length; i += 1) {
    if (words[i] !== first || !sameBytes(heap, i * 4, facts.header)) continue
    if (headerHits.length < HITS_KEPT) headerHits.push(i * 4)
    const base = i * 4 - HEADER_COPY_OFFSET
    if (holdsMainRam(heap, base, facts)) bases.push(base)
  }
  const base = bases.length === 1 ? bases[0] : undefined
  return { base, bases, headerHits, heapBytes: heap.length }
}

/** Main RAM at `base` in the heap that `heap` returns at each call. */
export function mainRamAt(heap: () => Uint8Array, base: number): MainRam {
  const view = () => {
    const bytes = heap()
    return new DataView(bytes.buffer, bytes.byteOffset + base, MAIN_RAM_SIZE)
  }
  return {
    base,
    read32: (address) => view().getUint32(ramOffset(address, 4), true),
    write32: (address, value) => {
      view().setUint32(ramOffset(address, 4), value >>> 0, true)
    },
    read: (address, length) => {
      const offset = base + ramOffset(address, length)
      return heap().slice(offset, offset + length)
    },
  }
}

/** The address of the middle word in the longest run of zero words: a word the game is least
 * likely to touch in the next second, for a write that is read back. */
export function quietWord(ram: Uint8Array): number {
  const words = new Uint32Array(ram.buffer, ram.byteOffset, ram.byteLength >>> 2)
  let best = { start: 0, length: 0 }
  let start = 0
  for (let i = 0; i <= words.length; i += 1) {
    if (i < words.length && words[i] === 0) continue
    if (i - start > best.length) best = { start, length: i - start }
    start = i + 1
  }
  if (best.length === 0) throw new RangeError('Main RAM holds no zero word.')
  return MAIN_RAM_START + (best.start + Math.floor(best.length / 2)) * 4
}
