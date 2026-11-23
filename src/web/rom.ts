// The built ROM in the page: the user's base ROM, checked by its SHA1 and patched with the build's
// patch, then checked against the SHA1 that the build's replay-slot.json names. The page fetches
// the patch and the description; the user's dump stays in this tab.
import build from '../../rom/gen3/build.json'
import { applyBps } from '../patch/bps-apply'
import type { SlotDescription } from '../patch/slot'
import { sha1Hex } from './sha1'

/** A dump the patch was not made from, or a slot description that does not fit the patch. */
export class RomError extends Error {
  override name = 'RomError'
}

/** The site's own files do not fit: the patch and replay-slot.json, or replay-slot.json itself. */
export class BuildMismatchError extends RomError {
  override name = 'BuildMismatchError'
}

const isCount = (value: unknown): boolean => Number.isSafeInteger(value) && Number(value) >= 0
const isText = (value: unknown): boolean => typeof value === 'string'

const FIELD_CHECKS: Record<keyof SlotDescription, (value: unknown) => boolean> = {
  slotVersion: isCount,
  magic: isText,
  offset: isCount,
  size: isCount,
  headerSize: isCount,
  lengthOffset: isCount,
  streamOffset: isCount,
  capacity: isCount,
  romSha1: isText,
  romSize: isCount,
}

type Json = Record<string, unknown>

function isObject(json: unknown): json is Json {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

function wrongFields(json: Json): string[] {
  return Object.entries(FIELD_CHECKS)
    .filter(([key, check]) => !check(json[key]))
    .map(([key]) => key)
}

function isDescription(json: Json): json is Json & SlotDescription {
  return wrongFields(json).length === 0
}

/**
 * Checks the fetched replay-slot.json and keeps the fields of a slot description. The site serves
 * the file with its build, so a broken one is a build mismatch, never the visitor's fault.
 */
export function readSlotDescription(json: unknown): SlotDescription {
  if (!isObject(json)) {
    throw new BuildMismatchError('replay-slot.json is not an object')
  }
  if (!isDescription(json)) {
    const names = wrongFields(json).map((key) => `"${key}"`)
    throw new BuildMismatchError(
      `replay-slot.json lacks ${names.join(', ')} or holds the wrong type there`,
    )
  }
  const entries = Object.keys(FIELD_CHECKS).map((key) => [key, json[key]])
  return Object.fromEntries(entries) as SlotDescription
}

/**
 * Refuses `base` unless it has the SHA1 the patch was made from (rom/gen3/build.json's by
 * default). The page runs it before it fetches the patch, so a wrong file costs no download.
 */
export async function checkBaseRom(
  base: Uint8Array,
  baseSha1: string = build.baseRom.sha1,
): Promise<void> {
  const found = await sha1Hex(base)
  if (found !== baseSha1) {
    throw new RomError(
      `This file is not the US Emerald dump the patch fits: its SHA1 is ${found}, ` +
        `US Emerald's is ${baseSha1}. Pick your US Emerald dump.`,
    )
  }
}

/**
 * The built ROM: `base`, which checkBaseRom passed, patched with `patch`, and refused unless the
 * result has the SHA1 that `description` names.
 */
export async function patchBaseRom(
  base: Uint8Array,
  patch: Uint8Array,
  description: SlotDescription,
): Promise<Uint8Array> {
  const rom = applyBps(patch, base)
  const built = await sha1Hex(rom)
  if (built !== description.romSha1) {
    throw new BuildMismatchError(
      `The patched ROM's SHA1 is ${built}, replay-slot.json names ${description.romSha1}: ` +
        'the patch and replay-slot.json come from different builds. Run npm run rom:build again.',
    )
  }
  return rom
}
