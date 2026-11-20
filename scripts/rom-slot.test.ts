import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  describeSlot,
  findSymbol,
  loadSlotLayout,
  readSlotLayout,
  SLOT_HEADER_PATH,
  SLOT_SYMBOL,
} from './rom-slot.ts'
import type { ElfSymbol } from './rom-slot.ts'

const layout = loadSlotLayout()
const HEADER_TEXT = readFileSync(SLOT_HEADER_PATH, 'utf8')

const NM_OUTPUT = [
  'gRngValue B 03005d80 00000004',
  'gReplaySlot T 08003000 00020000',
  'gReplaySlotEnd t 08023000 ',
  'Intr_Main t 08000248 ',
].join('\n')

const SLOT_OFFSET = 0x3000
const symbol: ElfSymbol = { name: SLOT_SYMBOL, address: 0x08000000 + SLOT_OFFSET, size: 0x20000 }

// A synthetic ROM: 0xFF filler around a slot header written as the C initializer does.
function syntheticRom(): Uint8Array {
  const rom = new Uint8Array(0x40000).fill(0xff)
  rom.fill(0, SLOT_OFFSET, SLOT_OFFSET + 0x20000)
  rom.set(new TextEncoder().encode('IRV_SLOT'), SLOT_OFFSET)
  const view = new DataView(rom.buffer)
  view.setUint16(SLOT_OFFSET + 0x08, 1, true)
  view.setUint16(SLOT_OFFSET + 0x0a, 0x20, true)
  view.setUint32(SLOT_OFFSET + 0x0c, 0x20000, true)
  return rom
}

describe('the slot layout', () => {
  it('comes from the REPLAY_SLOT_* defines of the real header', () => {
    expect(layout).toEqual({
      magic: 'IRV_SLOT',
      version: 1,
      headerSize: 0x20,
      size: 0x20000,
      alignment: 0x1000,
      offsets: { version: 0x08, headerSize: 0x0a, slotSize: 0x0c, streamLength: 0x10 },
    })
  })

  it('refuses a header without one of the defines', () => {
    const text = HEADER_TEXT.replace(/^#define REPLAY_SLOT_VERSION .*$/m, '')
    expect(() => readSlotLayout(text)).toThrow(/REPLAY_SLOT_VERSION missing/)
  })

  it('refuses a define that is no plain number', () => {
    const text = HEADER_TEXT.replace(
      /^#define REPLAY_SLOT_SIZE .*$/m,
      '#define REPLAY_SLOT_SIZE (1 << 17)',
    )
    expect(() => readSlotLayout(text)).toThrow(
      /REPLAY_SLOT_SIZE is "\(1 << 17\)", not a plain number/,
    )
  })

  it('refuses a magic of another length', () => {
    const text = HEADER_TEXT.replace('"IRV_SLOT"', '"IRV_SLOT2"')
    expect(() => readSlotLayout(text)).toThrow(/REPLAY_SLOT_MAGIC is no string of/)
  })
})

describe('findSymbol', () => {
  it('reads address and size from nm -P', () => {
    expect(findSymbol(NM_OUTPUT, SLOT_SYMBOL)).toEqual(symbol)
  })

  it('refuses an ELF without the symbol', () => {
    expect(() => findSymbol('gRngValue B 03005d80 00000004\n', SLOT_SYMBOL)).toThrow(
      'gReplaySlot not in the ELF',
    )
  })

  it('refuses a symbol without a size', () => {
    expect(() => findSymbol(NM_OUTPUT, 'Intr_Main')).toThrow(/Intr_Main has no size/)
  })
})

describe('describeSlot', () => {
  it('describes the slot by absolute file offsets', () => {
    const rom = syntheticRom()
    expect(describeSlot(rom, symbol, layout)).toEqual({
      slotVersion: 1,
      magic: 'IRV_SLOT',
      offset: 0x3000,
      size: 0x20000,
      headerSize: 0x20,
      lengthOffset: 0x3010,
      streamOffset: 0x3020,
      capacity: 0x20000 - 0x20,
      romSha1: createHash('sha1').update(rom).digest('hex'),
      romSize: 0x40000,
    })
  })

  const refuse = (change: (rom: Uint8Array) => void, message: RegExp, at = symbol) => {
    const rom = syntheticRom()
    change(rom)
    expect(() => describeSlot(rom, at, layout)).toThrow(message)
  }

  it('refuses a wrong magic', () => {
    refuse((rom) => (rom[SLOT_OFFSET] = 0x58), /no IRV_SLOT magic at 0x3000/)
  })

  it('refuses a nonzero stream byte', () => {
    refuse((rom) => (rom[SLOT_OFFSET + 0x1ffff] = 1), /nonzero byte at 0x22fff/)
  })

  it('refuses a nonzero reserved byte', () => {
    refuse((rom) => (rom[SLOT_OFFSET + 0x14] = 1), /nonzero byte at 0x3014/)
  })

  it('refuses an nm size that differs from the header', () => {
    refuse(() => undefined, /nm gives gReplaySlot 0x10000 bytes, replay_slot.h 0x20000/, {
      ...symbol,
      size: 0x10000,
    })
  })

  it('refuses an unaligned offset', () => {
    refuse(
      (rom) => rom.copyWithin(SLOT_OFFSET + 0x10, SLOT_OFFSET, SLOT_OFFSET + 0x20000 - 0x10),
      /0x3010 is not aligned to 0x1000/,
      {
        ...symbol,
        address: symbol.address + 0x10,
      },
    )
  })

  it('refuses a slot outside the ROM', () => {
    refuse(() => undefined, /gReplaySlot at 0x9000000 lies outside the ROM/, {
      ...symbol,
      address: 0x09000000,
    })
  })

  it('refuses a streamLength other than 0', () => {
    refuse((rom) => (rom[SLOT_OFFSET + 0x10] = 5), /streamLength is 5, expected 0/)
  })

  it('refuses header fields that differ from replay_slot.h', () => {
    refuse((rom) => (rom[SLOT_OFFSET + 0x08] = 2), /slotVersion is 2, expected 1/)
    refuse((rom) => (rom[SLOT_OFFSET + 0x0a] = 0x40), /headerSize is 64, expected 32/)
    refuse((rom) => (rom[SLOT_OFFSET + 0x0e] = 0x01), /slotSize is 65536, expected 131072/)
  })
})
