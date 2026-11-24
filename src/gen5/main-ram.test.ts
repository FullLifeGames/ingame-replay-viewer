import { describe, expect, it } from 'vitest'

import {
  ARM9_PROBE_SIZE,
  HEADER_COPY_OFFSET,
  HEADER_PROBE_SIZE,
  inMainRam,
  MAIN_RAM_SIZE,
  MAIN_RAM_START,
  mainRamAt,
  type MainRamFacts,
  quietWord,
  scanForMainRam,
  SECURE_AREA_SIZE,
} from './main-ram'

const ARM9_RAM_ADDRESS = 0x02004000
const ARM9_PROBE_AT = ARM9_RAM_ADDRESS - MAIN_RAM_START + SECURE_AREA_SIZE

/** Bytes that count up from `seed`, so no two probes look alike by chance. */
const pattern = (length: number, seed: number) =>
  Uint8Array.from({ length }, (_, i) => (seed + i * 7) & 0xff)

const facts: MainRamFacts = {
  header: pattern(HEADER_PROBE_SIZE, 0x50),
  arm9RamAddress: ARM9_RAM_ADDRESS,
  arm9Probe: pattern(ARM9_PROBE_SIZE, 0x13),
}

/** A heap with 0xEE filler, the ROM's own header at 0 and main RAM at each base given. */
function syntheticHeap(bases: readonly number[], withArm9 = true): Uint8Array {
  const heap = new Uint8Array(0x1000000).fill(0xee)
  heap.set(facts.header, 0)
  for (const base of bases) {
    heap.set(facts.header, base + HEADER_COPY_OFFSET)
    if (withArm9) heap.set(facts.arm9Probe, base + ARM9_PROBE_AT)
  }
  return heap
}

// Scene: the page must find the RAM the game runs in and never write into the copy of the ROM
// that the core keeps, which starts with the same header bytes.
describe('scanForMainRam', () => {
  it('finds the base where the header copy and the ARM9 bytes sit at their distance', () => {
    const scan = scanForMainRam(syntheticHeap([0x400100]), facts)
    expect(scan.base).toBe(0x400100)
    expect(scan.headerHits).toEqual([0, 0x400100 + HEADER_COPY_OFFSET])
    expect(scan.heapBytes).toBe(0x1000000)
  })

  it('gives no base for a header without the ARM9 bytes, as in the ROM copy', () => {
    const scan = scanForMainRam(syntheticHeap([0x400100], false), facts)
    expect(scan.base).toBeUndefined()
    expect(scan.headerHits).toEqual([0, 0x400100 + HEADER_COPY_OFFSET])
  })

  it('gives no base for two candidates and names both', () => {
    const scan = scanForMainRam(syntheticHeap([0x400000, 0x900000]), facts)
    expect(scan.base).toBeUndefined()
    expect(scan.bases).toEqual([0x400000, 0x900000])
  })
})

describe('mainRamAt', () => {
  it('reads and writes words at DS addresses', () => {
    const heap = syntheticHeap([0x400000])
    const ram = mainRamAt(() => heap, 0x400000)
    ram.write32(0x023ffe0c, 0x4f455249)
    expect(ram.read32(0x023ffe0c)).toBe(0x4f455249)
    expect(ram.read(MAIN_RAM_START + HEADER_COPY_OFFSET, 4)).toEqual(facts.header.subarray(0, 4))
  })

  it('throws on an address past main RAM', () => {
    const ram = mainRamAt(() => syntheticHeap([0]), 0)
    expect(() => ram.read32(0x02400000)).toThrow('outside DS main RAM')
    expect(() => ram.read(0x023ffffe, 4)).toThrow('outside DS main RAM')
    expect(() => {
      ram.write32(0x01fffffc, 1)
    }).toThrow('outside DS main RAM')
  })

  // Scene: the core's wasm memory grows and replaces the buffer; the old view goes stale.
  it('reads through the getter, so a grown heap is picked up', () => {
    let heap = syntheticHeap([0x100000])
    const ram = mainRamAt(() => heap, 0x100000)
    const grown = new Uint8Array(heap.length * 2)
    grown.set(heap)
    heap = grown
    ram.write32(MAIN_RAM_START, 0x12345678)
    expect(new DataView(grown.buffer).getUint32(0x100000, true)).toBe(0x12345678)
  })
})

describe('quietWord', () => {
  it('names the middle word of the longest run of zero words', () => {
    const ram = new Uint8Array(MAIN_RAM_SIZE).fill(0xff)
    ram.fill(0, 0x1000, 0x1100)
    ram.fill(0, 0x200000, 0x210000)
    expect(quietWord(ram)).toBe(MAIN_RAM_START + 0x208000)
  })

  it('throws when no word is zero', () => {
    expect(() => quietWord(new Uint8Array(MAIN_RAM_SIZE).fill(1))).toThrow('no zero word')
  })
})

// Scene: every part of the spike asks one rule whether an address lies in DS main RAM.
describe('inMainRam', () => {
  it('holds from 0x02000000 to the last byte below 0x02400000, for all bytes asked', () => {
    expect(inMainRam(0x02000000)).toBe(true)
    expect(inMainRam(0x023fffff)).toBe(true)
    expect(inMainRam(0x01ffffff)).toBe(false)
    expect(inMainRam(0x02400000)).toBe(false)
    expect(inMainRam(0x023ffffc, 4)).toBe(true)
    expect(inMainRam(0x023ffffd, 4)).toBe(false)
  })
})
