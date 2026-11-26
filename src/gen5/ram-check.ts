// Reads and checks of DS main RAM for the Gen 5 spike's input macro (#72): a value at an address
// or behind pointers, and the checks that an `until` step waits for. Pure: the page hands in a
// reader over the core's heap (src/web/gen5/frame-hook.ts), a spec hands in a map.
import { inMainRam } from './main-ram.ts'
import { type ChainEnd, chainAddress, type PointerChain } from './ram-chain.ts'

/** Reads a little-endian value of `width` bytes at a DS address in main RAM. */
export type ReadRam = (address: number, width: 1 | 2 | 4) => number

/** A value of `width` bytes at a fixed address or behind its chain of pointers (ram-chain.ts). */
export interface RamRef extends PointerChain {
  name: string
  width: 1 | 2 | 4
  /** Keep only these bits of the value. */
  mask?: number
}

export interface RamCheck extends RamRef {
  oneOf?: readonly number[]
  /** Values the check waits to see left behind, such as the row the player stands on now. */
  noneOf?: readonly number[]
  atMost?: number
  /** The value is a pointer into main RAM. */
  mainRamPointer?: boolean
}

const hex = (value: number) => `0x${value.toString(16)}`

/** The DS address of the value `ref` names, or the fault of its chain. */
function refEnd(ref: RamRef, read: ReadRam): ChainEnd {
  return chainAddress(ref.name, ref, ref.width, (address) => read(address, 4))
}

/** `value` under `ref`'s mask, if it has one. */
export function maskedValue(ref: RamRef, value: number): number {
  return ref.mask === undefined ? value : (value & ref.mask) >>> 0
}

/** The value `ref` names, or undefined when its chain leads out of main RAM. */
export function readRef(ref: RamRef, read: ReadRam): number | undefined {
  const end = refEnd(ref, read)
  return 'fault' in end ? undefined : maskedValue(ref, read(end.address, ref.width))
}

/** What is wrong with one check's value, or undefined when it holds. */
function checkFault(check: RamCheck, value: number): string | undefined {
  const read = `${check.name} read ${hex(value)}`
  if (check.oneOf && !check.oneOf.includes(value)) {
    return `${read}, not one of ${check.oneOf.map(hex).join(' ')}`
  }
  if (check.noneOf?.includes(value)) return `${read}, one of ${check.noneOf.map(hex).join(' ')}`
  if (check.atMost !== undefined && value > check.atMost)
    return `${read}, above ${hex(check.atMost)}`
  if (check.mainRamPointer && !inMainRam(value, 1)) return `${read}, not a pointer into main RAM`
  return undefined
}

/** The first check that does not hold, named with what it read; undefined when all hold. */
export function failingCheck(checks: readonly RamCheck[], read: ReadRam): string | undefined {
  for (const check of checks) {
    const end = refEnd(check, read)
    if ('fault' in end) return end.fault
    const fault = checkFault(check, maskedValue(check, read(end.address, check.width)))
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
