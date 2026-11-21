import { describe, expect, it } from 'vitest'

import build from '../../rom/gen3/build.json'
import { createBps } from '../patch/bps-create'
import type { SlotDescription } from '../patch/slot'
import { patchBaseRom, readSlotDescription, RomError } from './rom'
import { sha1Hex } from './sha1'

// Synthetic bytes only: a small "base ROM" and a "built ROM" that differs in a few places.
function synthetic(size: number, seed: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31 + seed) & 0xff)
}

const BASE = synthetic(0x400, 7)
const TARGET = new Uint8Array(BASE)
TARGET.set(new TextEncoder().encode('IRV_SLOT'), 0x100)
TARGET.fill(0, 0x108, 0x160)
const PATCH = createBps(BASE, TARGET)
const BASE_SHA1 = await sha1Hex(BASE)

const DESCRIPTION: SlotDescription = {
  slotVersion: 1,
  magic: 'IRV_SLOT',
  offset: 0x100,
  size: 0x60,
  headerSize: 0x20,
  lengthOffset: 0x110,
  streamOffset: 0x120,
  capacity: 0x40,
  romSha1: await sha1Hex(TARGET),
  romSize: TARGET.length,
}

describe('patchBaseRom', () => {
  it('gives the built ROM for the right dump', async () => {
    expect(await patchBaseRom(BASE, PATCH, DESCRIPTION, BASE_SHA1)).toEqual(TARGET)
  })

  // The user picks a European Emerald, or any other file: its SHA1 is not the build's.
  it('refuses a dump with another SHA1 and names both SHA1s', async () => {
    const other = synthetic(0x400, 8)
    const otherSha1 = await sha1Hex(other)
    const refusal = patchBaseRom(other, PATCH, DESCRIPTION, BASE_SHA1)
    await expect(refusal).rejects.toThrow(RomError)
    await expect(refusal).rejects.toThrow(
      `This file is not the US Emerald dump the patch was made from: its SHA1 is ${otherSha1}, ` +
        `the patch needs ${BASE_SHA1}. Pick your US Emerald dump.`,
    )
  })

  it('checks against the base ROM SHA1 in rom/gen3/build.json by default', async () => {
    await expect(patchBaseRom(BASE, PATCH, DESCRIPTION)).rejects.toThrow(
      `the patch needs ${build.baseRom.sha1}`,
    )
  })

  // build/rom/ holds a patch from another build than replay-slot.json.
  it('refuses a result whose SHA1 is not the one replay-slot.json names', async () => {
    const stale = { ...DESCRIPTION, romSha1: BASE_SHA1 }
    const refusal = patchBaseRom(BASE, PATCH, stale, BASE_SHA1)
    await expect(refusal).rejects.toThrow(RomError)
    await expect(refusal).rejects.toThrow(
      `The patched ROM's SHA1 is ${DESCRIPTION.romSha1}, replay-slot.json names ${BASE_SHA1}: ` +
        'the patch and replay-slot.json come from different builds. Run npm run rom:build again.',
    )
  })

  it('lets the patch codec refuse a damaged patch', async () => {
    const damaged = new Uint8Array(PATCH)
    damaged[8] = (damaged[8] ?? 0) ^ 0xff
    await expect(patchBaseRom(BASE, damaged, DESCRIPTION, BASE_SHA1)).rejects.toThrow(/^BPS: /)
  })
})

describe('readSlotDescription', () => {
  it('keeps the fields of a well-formed description', () => {
    expect(readSlotDescription({ ...DESCRIPTION, extra: true })).toEqual(DESCRIPTION)
  })

  it('refuses a description that lacks a field', () => {
    const partial = Object.fromEntries(
      Object.entries(DESCRIPTION).filter(([key]) => key !== 'capacity'),
    )
    expect(() => readSlotDescription(partial)).toThrow(
      'replay-slot.json lacks "capacity" or holds the wrong type there',
    )
  })

  it('refuses a string where a number belongs', () => {
    expect(() => readSlotDescription({ ...DESCRIPTION, offset: '0x100' })).toThrow(
      'replay-slot.json lacks "offset" or holds the wrong type there',
    )
  })

  it('refuses a negative or fractional offset and a number where a string belongs', () => {
    const wrong = { ...DESCRIPTION, offset: -1, size: 0.5, magic: 0 }
    expect(() => readSlotDescription(wrong)).toThrow(
      'replay-slot.json lacks "magic", "offset", "size" or holds the wrong type there',
    )
  })

  it('refuses JSON that is not an object', () => {
    expect(() => readSlotDescription([DESCRIPTION])).toThrow(RomError)
    expect(() => readSlotDescription(null)).toThrow('replay-slot.json is not an object')
  })
})
