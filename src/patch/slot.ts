// The replay slot of a built ROM (ADR 0008): the description that the build writes next to the
// patch, and the one rule for putting a stream into the slot. The page (#8) and the screenshot
// tool (scripts/rom-shot.ts) both write through it.

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
