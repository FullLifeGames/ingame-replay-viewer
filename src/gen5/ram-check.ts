// Reads and checks of DS main RAM for the Gen 5 spike's input macro (#72): a value at an address
// or behind a pointer, and the checks that an `until` step waits for. Pure: the page hands in a
// reader over the core's heap (src/web/gen5/frame-hook.ts), a spec hands in a map.
import { inMainRam } from './main-ram.ts'

/** Reads a little-endian value of `width` bytes at a DS address in main RAM. */
export type ReadRam = (address: number, width: 1 | 2 | 4) => number

export interface RamRef {
  name: string
  address: number
  width: 1 | 2 | 4
  /** Read a pointer at `address`, then the value at the pointer plus `offset`. */
  offset?: number
  /** Keep only these bits of the value. */
  mask?: number
}

export interface RamCheck extends RamRef {
  oneOf?: readonly number[]
  atMost?: number
  /** The value is a pointer into main RAM. */
  mainRamPointer?: boolean
}

const hex = (value: number) => `0x${value.toString(16)}`

/** The DS address of the value `ref` names. A ref with an offset adds it to `pointer`, the word
 * at `ref.address`, and gives undefined when that leads out of main RAM; a plain ref ignores it. */
export function refAddress(ref: RamRef, pointer: number): number | undefined {
  if (ref.offset === undefined) return ref.address
  const address = pointer + ref.offset
  return inMainRam(address, ref.width) ? address : undefined
}

/** `value` under `ref`'s mask, if it has one. */
export function maskedValue(ref: RamRef, value: number): number {
  return ref.mask === undefined ? value : (value & ref.mask) >>> 0
}

/** The value `ref` names, or undefined when its pointer does not lead into main RAM. */
export function readRef(ref: RamRef, read: ReadRam): number | undefined {
  const address = refAddress(ref, ref.offset === undefined ? 0 : read(ref.address, 4))
  return address === undefined ? undefined : maskedValue(ref, read(address, ref.width))
}

/** What is wrong with one check's value, or undefined when it holds. */
function checkFault(check: RamCheck, value: number): string | undefined {
  const read = `${check.name} read ${hex(value)}`
  if (check.oneOf && !check.oneOf.includes(value)) {
    return `${read}, not one of ${check.oneOf.map(hex).join(' ')}`
  }
  if (check.atMost !== undefined && value > check.atMost)
    return `${read}, above ${hex(check.atMost)}`
  if (check.mainRamPointer && !inMainRam(value, 1)) return `${read}, not a pointer into main RAM`
  return undefined
}

/** The first check that does not hold, named with what it read; undefined when all hold. */
export function failingCheck(checks: readonly RamCheck[], read: ReadRam): string | undefined {
  for (const check of checks) {
    const value = readRef(check, read)
    if (value === undefined) return `${check.name}: its pointer does not lead into main RAM`
    const fault = checkFault(check, value)
    if (fault !== undefined) return fault
  }
  return undefined
}

/** The values that changed between two reads of `refs`, as `name=0x…` (`none` for a pointer
 * that led nowhere), or '' when none did. */
export function changedValues(
  refs: readonly RamRef[],
  before: readonly (number | undefined)[],
  after: readonly (number | undefined)[],
): string {
  return refs
    .map((ref, i) => {
      const value = after[i]
      if (value === before[i]) return ''
      return `${ref.name}=${value === undefined ? 'none' : hex(value)}`
    })
    .filter((part) => part !== '')
    .join(' ')
}
