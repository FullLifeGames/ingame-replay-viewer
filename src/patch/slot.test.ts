import { describe, expect, it } from 'vitest'

import header from '../../rom/gen3/include/replay_slot.h?raw'
import {
  checkSlotHeader,
  readSlotHeader,
  readSlotHeaderLayout,
  SlotError,
  SlotMismatchError,
  writeReplaySlot,
} from './slot.ts'
import type { SlotDescription } from './slot.ts'

// A small ROM with the slot at 0x100: 0x20 bytes of header, 0x40 bytes of stream.
const DESCRIPTION: SlotDescription = {
  slotVersion: 1,
  magic: 'IRV_SLOT',
  offset: 0x100,
  size: 0x60,
  headerSize: 0x20,
  lengthOffset: 0x110,
  streamOffset: 0x120,
  capacity: 0x40,
  romSha1: 'not checked here',
  romSize: 0x200,
}

function emptyRom(): Uint8Array {
  const rom = new Uint8Array(DESCRIPTION.romSize).fill(0xff)
  rom.fill(0, DESCRIPTION.offset, DESCRIPTION.offset + DESCRIPTION.size)
  rom.set(new TextEncoder().encode(DESCRIPTION.magic), DESCRIPTION.offset)
  return rom
}

const streamOf = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 7 + 1) & 0xff)

const lengthAt = (rom: Uint8Array) =>
  new DataView(rom.buffer).getUint32(DESCRIPTION.lengthOffset, true)

describe('writing a stream into the replay slot', () => {
  it('puts the length little-endian at lengthOffset and the bytes at streamOffset (S1)', () => {
    const stream = streamOf(35)
    const rom = writeReplaySlot(emptyRom(), DESCRIPTION, stream)
    expect(lengthAt(rom)).toBe(stream.length)
    expect(rom.subarray(DESCRIPTION.lengthOffset, DESCRIPTION.lengthOffset + 4)).toEqual(
      Uint8Array.of(stream.length, 0, 0, 0),
    )
    const end = DESCRIPTION.streamOffset + stream.length
    expect(rom.subarray(DESCRIPTION.streamOffset, end)).toEqual(stream)
  })

  it('leaves every other byte of the ROM as it was and the ROM it got untouched', () => {
    const before = emptyRom()
    const rom = writeReplaySlot(before, DESCRIPTION, streamOf(5))
    expect(before).toEqual(emptyRom())
    const changed = [...rom.keys()].filter((i) => rom[i] !== before[i])
    const inLength = (i: number) =>
      i >= DESCRIPTION.lengthOffset && i < DESCRIPTION.lengthOffset + 4
    const inStream = (i: number) =>
      i >= DESCRIPTION.streamOffset && i < DESCRIPTION.streamOffset + 5
    expect(changed.every((i) => inLength(i) || inStream(i))).toBe(true)
  })

  it('copies a ROM whose slice shares memory, as a Node Buffer does', () => {
    class SharingView extends Uint8Array {
      override slice(start?: number, end?: number): Uint8Array<ArrayBuffer> {
        return this.subarray(start, end)
      }
    }
    const before = new SharingView(emptyRom())
    writeReplaySlot(before, DESCRIPTION, streamOf(5))
    expect(Uint8Array.from(before)).toEqual(emptyRom())
  })

  it('writes the length at its offset in a ROM that starts inside a larger buffer', () => {
    const buffer = new Uint8Array(DESCRIPTION.romSize + 16)
    buffer.set(emptyRom(), 16)
    const rom = writeReplaySlot(buffer.subarray(16), DESCRIPTION, streamOf(9))
    expect(rom.length).toBe(DESCRIPTION.romSize)
    expect(lengthAt(rom)).toBe(9)
  })

  it('takes a stream of exactly the capacity', () => {
    const rom = writeReplaySlot(emptyRom(), DESCRIPTION, streamOf(DESCRIPTION.capacity))
    expect(lengthAt(rom)).toBe(DESCRIPTION.capacity)
    expect(rom[DESCRIPTION.offset + DESCRIPTION.size]).toBe(0xff)
  })

  it('clears what a longer stream left in the slot before', () => {
    const first = writeReplaySlot(emptyRom(), DESCRIPTION, streamOf(DESCRIPTION.capacity))
    const rom = writeReplaySlot(first, DESCRIPTION, streamOf(3))
    expect(lengthAt(rom)).toBe(3)
    expect(
      rom.subarray(DESCRIPTION.streamOffset + 3, DESCRIPTION.offset + DESCRIPTION.size),
    ).toEqual(new Uint8Array(DESCRIPTION.capacity - 3))
  })

  it('refuses a stream of the capacity plus one byte (S2)', () => {
    expect(() =>
      writeReplaySlot(emptyRom(), DESCRIPTION, streamOf(DESCRIPTION.capacity + 1)),
    ).toThrow(new SlotError('the stream has 65 bytes, the replay slot holds 64'))
  })

  it('refuses a ROM whose magic differs (S3)', () => {
    const rom = emptyRom()
    rom[DESCRIPTION.offset + 3] = 0x58
    expect(() => writeReplaySlot(rom, DESCRIPTION, streamOf(4))).toThrow(
      new SlotError('no IRV_SLOT magic at 0x100: this ROM is not the one the description names'),
    )
  })

  it('refuses a ROM that ends before the slot does', () => {
    const rom = emptyRom().subarray(0, DESCRIPTION.offset + DESCRIPTION.size - 1)
    expect(() => writeReplaySlot(rom, DESCRIPTION, streamOf(4))).toThrow(
      new SlotError('the ROM has 0x15f bytes and ends before the replay slot at 0x100 does'),
    )
  })
})

const LAYOUT = readSlotHeaderLayout(header)

// The slot's header as the build writes it (rom/gen3/src/replay_slot.c), for DESCRIPTION's slot.
function slotHeader(fields: { version?: number; headerSize?: number; size?: number } = {}) {
  const bytes = new Uint8Array(DESCRIPTION.headerSize)
  bytes.set(new TextEncoder().encode(DESCRIPTION.magic))
  const view = new DataView(bytes.buffer)
  view.setUint16(0x08, fields.version ?? DESCRIPTION.slotVersion, true)
  view.setUint16(0x0a, fields.headerSize ?? DESCRIPTION.headerSize, true)
  view.setUint32(0x0c, fields.size ?? DESCRIPTION.size, true)
  return bytes
}

describe("the slot's own header", () => {
  it('has the field offsets of replay_slot.h', () => {
    expect(LAYOUT).toEqual({ version: 0x08, headerSize: 0x0a, slotSize: 0x0c, streamLength: 0x10 })
  })

  it('refuses a header text without one of the offsets', () => {
    const text = header.replace(/^#define REPLAY_SLOT_OFFSET_SLOT_SIZE.*$/m, '')
    expect(() => readSlotHeaderLayout(text)).toThrow(
      'replay_slot.h: REPLAY_SLOT_OFFSET_SLOT_SIZE missing',
    )
  })

  it('refuses an offset that is not a plain number', () => {
    const text = header.replace(
      /^#define REPLAY_SLOT_OFFSET_VERSION .*$/m,
      '#define REPLAY_SLOT_OFFSET_VERSION (4 + 4)',
    )
    expect(() => readSlotHeaderLayout(text)).toThrow(
      'replay_slot.h: REPLAY_SLOT_OFFSET_VERSION is "(4 + 4)", not a plain number',
    )
  })

  it('reads the magic, the version and both sizes', () => {
    expect(readSlotHeader(slotHeader({ size: 0x20000 }), LAYOUT, 8)).toEqual({
      magic: 'IRV_SLOT',
      slotVersion: 1,
      headerSize: 0x20,
      size: 0x20000,
    })
  })

  it('refuses a slot too short for its header', () => {
    expect(() => readSlotHeader(slotHeader().subarray(0, 0x0f), LAYOUT, 8)).toThrow(
      new SlotError('the replay slot has 0xf bytes, its header needs 0x10'),
    )
  })

  it('passes a description of the same build', () => {
    expect(() => {
      checkSlotHeader(slotHeader(), DESCRIPTION, LAYOUT)
    }).not.toThrow()
  })

  it.each([
    [{ version: 2 }, 'version 2 and replay-slot.json gives 1'],
    [{ headerSize: 0x40 }, 'header size 0x40 and replay-slot.json gives 0x20'],
    [{ size: 0x20000 }, 'slot size 0x20000 and replay-slot.json gives 0x60'],
  ])('refuses a description of another build: %o', (fields, values) => {
    expect(() => {
      checkSlotHeader(slotHeader(fields), DESCRIPTION, LAYOUT)
    }).toThrow(
      new SlotMismatchError(`the slot gives ${values}, so they come from different builds`),
    )
  })

  it.each([
    [{ streamOffset: 0x130 }, 'stream offset 0x20 and replay-slot.json gives 0x30'],
    [{ lengthOffset: 0x114 }, 'length offset 0x10 and replay-slot.json gives 0x14'],
    [{ capacity: 0x3f }, 'capacity 0x40 and replay-slot.json gives 0x3f'],
  ])('refuses a description whose places disagree with the header: %o', (change, values) => {
    expect(() => {
      checkSlotHeader(slotHeader(), { ...DESCRIPTION, ...change }, LAYOUT)
    }).toThrow(
      new SlotMismatchError(`the slot gives ${values}, so they come from different builds`),
    )
  })

  it('refuses a slot without the magic before it reads the sizes', () => {
    const bytes = slotHeader({ version: 2 })
    bytes[0] = 0
    expect(() => {
      checkSlotHeader(bytes, DESCRIPTION, LAYOUT)
    }).toThrow(
      new SlotError(
        'no IRV_SLOT magic at the start of the slot: it is not the slot the description names',
      ),
    )
  })
})
