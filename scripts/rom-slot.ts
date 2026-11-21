// The replay slot on the build side (ADR 0008): its layout from rom/gen3/include/replay_slot.h,
// its place from `nm -P` over the ELF, the check of its bytes in the ROM, and the description file
// that the page reads.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SlotDescription } from '../src/patch/slot.ts'
import { ROM_DIR } from './rom-config.ts'

export const SLOT_SYMBOL = 'gReplaySlot'
export const SLOT_HEADER_PATH = join(ROM_DIR, 'include', 'replay_slot.h')

export interface SlotLayout {
  magic: string
  version: number
  headerSize: number
  size: number
  alignment: number
  offsets: { version: number; headerSize: number; slotSize: number; streamLength: number }
}

export interface ElfSymbol {
  name: string
  address: number
  size: number
}

// The GBA maps the cartridge ROM at this address, so a ROM symbol's file offset is its address minus it.
export const GBA_ROM_BASE = 0x08000000

const hex = (value: number) => `0x${value.toString(16)}`

function readDefines(headerText: string): Map<string, string> {
  const defines = new Map<string, string>()
  for (const match of headerText.matchAll(
    /^#define\s+(REPLAY_SLOT_\w+)\s+(.+?)\s*(?:\/\/.*)?$/gm,
  )) {
    defines.set(match[1] as string, match[2] as string)
  }
  return defines
}

export function readSlotLayout(headerText: string): SlotLayout {
  const defines = readDefines(headerText)
  const value = (name: string) => {
    const text = defines.get(`REPLAY_SLOT_${name}`)
    if (text === undefined) throw new Error(`replay_slot.h: REPLAY_SLOT_${name} missing`)
    return text
  }
  const number = (name: string) => {
    const text = value(name)
    if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) {
      throw new Error(`replay_slot.h: REPLAY_SLOT_${name} is "${text}", not a plain number`)
    }
    return Number(text)
  }
  const magic = /^"([^"]*)"$/.exec(value('MAGIC'))?.[1]
  if (magic?.length !== number('MAGIC_LENGTH')) {
    throw new Error('replay_slot.h: REPLAY_SLOT_MAGIC is no string of REPLAY_SLOT_MAGIC_LENGTH')
  }
  return {
    magic,
    version: number('VERSION'),
    headerSize: number('HEADER_SIZE'),
    size: number('SIZE'),
    alignment: number('ALIGNMENT'),
    offsets: {
      version: number('OFFSET_VERSION'),
      headerSize: number('OFFSET_HEADER_SIZE'),
      slotSize: number('OFFSET_SLOT_SIZE'),
      streamLength: number('OFFSET_STREAM_LENGTH'),
    },
  }
}

export function loadSlotLayout(path = SLOT_HEADER_PATH): SlotLayout {
  return readSlotLayout(readFileSync(path, 'utf8'))
}

// One line of `nm -P`: name, type, value and size, both in hex; symbols without a size lack the last.
export function findSymbol(nmOutput: string, name: string): ElfSymbol {
  for (const line of nmOutput.split('\n')) {
    const [symbolName, , address, size] = line.trim().split(/\s+/)
    if (symbolName !== name || address === undefined) continue
    if (size === undefined) throw new Error(`${name} has no size in the nm output`)
    return { name, address: Number.parseInt(address, 16), size: Number.parseInt(size, 16) }
  }
  throw new Error(`${name} not in the ELF`)
}

function placementProblems(rom: Uint8Array, symbol: ElfSymbol, layout: SlotLayout): string[] {
  const offset = symbol.address - GBA_ROM_BASE
  const problems: string[] = []
  if (symbol.size !== layout.size) {
    problems.push(
      `nm gives ${symbol.name} ${hex(symbol.size)} bytes, replay_slot.h ${hex(layout.size)}`,
    )
  }
  if (offset < 0 || offset + layout.size > rom.length) {
    problems.push(`${symbol.name} at ${hex(symbol.address)} lies outside the ROM`)
  }
  if (offset % layout.alignment !== 0) {
    problems.push(`the slot offset ${hex(offset)} is not aligned to ${hex(layout.alignment)}`)
  }
  return problems
}

function contentProblems(rom: Uint8Array, offset: number, layout: SlotLayout): string[] {
  const problems: string[] = []
  const magic = new TextDecoder().decode(rom.subarray(offset, offset + layout.magic.length))
  if (magic !== layout.magic) problems.push(`no ${layout.magic} magic at ${hex(offset)}`)
  const view = new DataView(rom.buffer, rom.byteOffset + offset, layout.size)
  const fields = [
    ['slotVersion', view.getUint16(layout.offsets.version, true), layout.version],
    ['headerSize', view.getUint16(layout.offsets.headerSize, true), layout.headerSize],
    ['slotSize', view.getUint32(layout.offsets.slotSize, true), layout.size],
    ['streamLength', view.getUint32(layout.offsets.streamLength, true), 0],
  ] as const
  for (const [field, actual, expected] of fields) {
    if (actual !== expected) {
      problems.push(`${field} is ${String(actual)}, expected ${String(expected)}`)
    }
  }
  // Everything after the streamLength field is zero in the built ROM: reserved bytes and stream.
  const zeroFrom = offset + layout.offsets.streamLength + 4
  const nonzero = rom.subarray(zeroFrom, offset + layout.size).findIndex((byte) => byte !== 0)
  if (nonzero >= 0) problems.push(`nonzero byte at ${hex(zeroFrom + nonzero)} in the slot`)
  return problems
}

// Checks the slot in the built ROM and describes it for the page. The description is the
// authority on where the slot is; the magic only confirms it.
export function describeSlot(
  rom: Uint8Array,
  symbol: ElfSymbol,
  layout: SlotLayout,
): SlotDescription {
  const offset = symbol.address - GBA_ROM_BASE
  const problems = placementProblems(rom, symbol, layout)
  if (problems.length === 0) problems.push(...contentProblems(rom, offset, layout))
  if (problems.length > 0) throw new Error(`replay slot: ${problems.join('; ')}`)
  return {
    slotVersion: layout.version,
    magic: layout.magic,
    offset,
    size: layout.size,
    headerSize: layout.headerSize,
    lengthOffset: offset + layout.offsets.streamLength,
    streamOffset: offset + layout.headerSize,
    capacity: layout.size - layout.headerSize,
    romSha1: createHash('sha1').update(rom).digest('hex'),
    romSize: rom.length,
  }
}
