// The replay slot of a built ROM (ADR 0008): the description that the build writes next to the
// patch, the check of a slot's own header against it, and the one rule for putting a stream into
// the slot. The page (#8) and the screenshot tool (scripts/rom-shot.ts) both write through it.

/** Where the slot lies in the built ROM; build/rom/replay-slot.json holds one. */
export interface SlotDescription {
  slotVersion: number
  magic: string
  offset: number
  size: number
  headerSize: number
  lengthOffset: number
  streamOffset: number
  capacity: number
  romSha1: string
  romSize: number
}

export class SlotError extends Error {
  override name = 'SlotError'
}

const hex = (value: number) => `0x${value.toString(16)}`

/** Byte offsets of the slot header's fields: the REPLAY_SLOT_OFFSET_* defines of replay_slot.h. */
export interface SlotHeaderLayout {
  version: number
  headerSize: number
  slotSize: number
  streamLength: number
}

/** What a slot's own header says, as the build wrote it (rom/gen3/src/replay_slot.c). */
export interface SlotHeader {
  magic: string
  slotVersion: number
  headerSize: number
  size: number
}

function readOffsetDefine(headerText: string, field: string): number {
  const name = `REPLAY_SLOT_OFFSET_${field}`
  const text = new RegExp(`^#define\\s+${name}\\s+(.+?)\\s*(?://.*)?$`, 'm').exec(headerText)?.[1]
  if (text === undefined) throw new SlotError(`replay_slot.h: ${name} missing`)
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) {
    throw new SlotError(`replay_slot.h: ${name} is "${text}", not a plain number`)
  }
  return Number(text)
}

/** The header's field offsets from the text of rom/gen3/include/replay_slot.h. */
export function readSlotHeaderLayout(headerText: string): SlotHeaderLayout {
  return {
    version: readOffsetDefine(headerText, 'VERSION'),
    headerSize: readOffsetDefine(headerText, 'HEADER_SIZE'),
    slotSize: readOffsetDefine(headerText, 'SLOT_SIZE'),
    streamLength: readOffsetDefine(headerText, 'STREAM_LENGTH'),
  }
}

/** The header at the start of `slot`; the magic is the first `magicLength` bytes. */
export function readSlotHeader(
  slot: Uint8Array,
  layout: SlotHeaderLayout,
  magicLength: number,
): SlotHeader {
  const needs = Math.max(
    magicLength,
    layout.version + 2,
    layout.headerSize + 2,
    layout.slotSize + 4,
  )
  if (slot.length < needs) {
    throw new SlotError(
      `the replay slot has ${hex(slot.length)} bytes, its header needs ${hex(needs)}`,
    )
  }
  const view = new DataView(slot.buffer, slot.byteOffset, slot.byteLength)
  return {
    magic: String.fromCharCode(...slot.subarray(0, magicLength)),
    slotVersion: view.getUint16(layout.version, true),
    headerSize: view.getUint16(layout.headerSize, true),
    size: view.getUint32(layout.slotSize, true),
  }
}

/**
 * Refuses a description from another build than the slot at the start of `slot`: its
 * version, its sizes and the places of the length and the stream must match the slot's header.
 */
export function checkSlotHeader(
  slot: Uint8Array,
  description: SlotDescription,
  layout: SlotHeaderLayout,
): void {
  const found = readSlotHeader(slot, layout, description.magic.length)
  if (found.magic !== description.magic) {
    throw new SlotError(
      `no ${description.magic} magic at the start of the slot: it is not the slot the description names`,
    )
  }
  const { offset } = description
  const fields: [string, number, number, (value: number) => string][] = [
    ['version', found.slotVersion, description.slotVersion, String],
    ['header size', found.headerSize, description.headerSize, hex],
    ['slot size', found.size, description.size, hex],
    ['stream offset', found.headerSize, description.streamOffset - offset, hex],
    ['length offset', layout.streamLength, description.lengthOffset - offset, hex],
    ['capacity', found.size - found.headerSize, description.capacity, hex],
  ]
  const differs = fields.find(([, inHeader, inDescription]) => inHeader !== inDescription)
  if (differs === undefined) return
  const [name, inHeader, inDescription, show] = differs
  throw new SlotError(
    `the slot's header gives ${name} ${show(inHeader)}, the slot description ${name} ` +
      `${show(inDescription)}, so the two come from different builds`,
  )
}

function checkRom(rom: Uint8Array, description: SlotDescription): void {
  const { offset, size, magic } = description
  if (rom.length < offset + size) {
    throw new SlotError(
      `the ROM has ${hex(rom.length)} bytes and ends before the replay slot at ${hex(offset)} does`,
    )
  }
  const found = String.fromCharCode(...rom.subarray(offset, offset + magic.length))
  if (found !== magic) {
    throw new SlotError(
      `no ${magic} magic at ${hex(offset)}: this ROM is not the one the description names`,
    )
  }
}

/**
 * A copy of the ROM with the stream in its slot: the stream's length as a little-endian u32 at
 * `lengthOffset`, its bytes at `streamOffset`, and zeros after them to the end of the slot.
 */
export function writeReplaySlot(
  rom: Uint8Array,
  description: SlotDescription,
  stream: Uint8Array,
): Uint8Array {
  checkRom(rom, description)
  if (stream.length > description.capacity) {
    throw new SlotError(
      `the stream has ${String(stream.length)} bytes, the replay slot holds ${String(description.capacity)}`,
    )
  }
  // A fresh array: a Node Buffer's slice would share the ROM's memory and its pool's offset.
  const copy = new Uint8Array(rom)
  copy.fill(0, description.streamOffset, description.streamOffset + description.capacity)
  copy.set(stream, description.streamOffset)
  new DataView(copy.buffer, copy.byteOffset).setUint32(
    description.lengthOffset,
    stream.length,
    true,
  )
  return copy
}
