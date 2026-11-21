// What the build hands to the page (plan §4, §5): the description of the replay slot and the BPS
// patch from the user's dump to the built ROM. The patch counts only once it gives that ROM back.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { applyBps } from '../src/patch/bps-apply.ts'
import { createBps } from '../src/patch/bps-create.ts'
import type { SlotDescription } from '../src/patch/slot.ts'
import { describeSlot, findSymbol, SLOT_SYMBOL } from './rom-slot.ts'
import type { SlotLayout } from './rom-slot.ts'

// The files in build/rom/; the ROM build and the reproducibility check both name them from here.
export const OUTPUT_NAMES = {
  rom: 'irv-emerald.gba',
  elf: 'irv-emerald.elf',
  map: 'irv-emerald.map',
  patch: 'irv-emerald.bps',
  slot: 'replay-slot.json',
  info: 'build-info.json',
  makeLog: 'make.log',
}

export interface RomOutputs {
  description: SlotDescription
  patch: Uint8Array
  sha1: { rom: string; patch: string; base: string }
}

export interface OutputInput {
  rom: Uint8Array
  base: Uint8Array
  nmOutput: string
  layout: SlotLayout
}

const sha1 = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('hex')

export function checkRoundTrip(patch: Uint8Array, base: Uint8Array, rom: Uint8Array): void {
  const patched = sha1(applyBps(patch, base))
  const built = sha1(rom)
  if (patched !== built) {
    throw new Error(
      `the patch applied to the base ROM gives SHA1 ${patched}, the built ROM has ${built}`,
    )
  }
}

export function makeOutputs(input: OutputInput): RomOutputs {
  const { rom, base, nmOutput, layout } = input
  const description = describeSlot(rom, findSymbol(nmOutput, SLOT_SYMBOL), layout)
  const patch = createBps(base, rom)
  checkRoundTrip(patch, base, rom)
  return {
    description,
    patch,
    sha1: { rom: description.romSha1, patch: sha1(patch), base: sha1(base) },
  }
}

export function writeOutputs(dir: string, outputs: RomOutputs): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, OUTPUT_NAMES.patch), outputs.patch)
  writeFileSync(join(dir, OUTPUT_NAMES.slot), `${JSON.stringify(outputs.description, null, 2)}\n`)
}
