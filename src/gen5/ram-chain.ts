// The address of a value behind pointers in DS main RAM (#97): the game's heap decides where its
// objects live, so the page knows only a fixed word that points at one, and from there more
// pointers. Pure: the page hands in a word reader over the core's heap, a spec hands in a map.
import { inMainRam } from './main-ram.ts'

/** Bytes a pointer takes, for a hop that reads one more. */
const WORD = 4

/** A value's place: a fixed address, then for each hop the word read there as a pointer plus the
 * hop's offset. No hop: the fixed address itself. Plain numbers, so it crosses into the page as
 * JSON. */
export interface PointerChain {
  address: number
  hops?: readonly number[]
}

/** The address a chain leads to, or why it does not, named by its field and hop. */
export type ChainEnd = { address: number } | { fault: string }

/** Where a chain stands after the pointers read so far: the address to read next, or its end. */
export function chainStep(
  name: string,
  chain: PointerChain,
  length: number,
  pointers: readonly number[],
): { read: number } | ChainEnd {
  const hops = chain.hops ?? []
  const room = (hop: number) => (hop < hops.length - 1 ? WORD : length)
  if (!inMainRam(chain.address, hops.length === 0 ? length : WORD)) {
    return { fault: `${name}: its address lies outside main RAM` }
  }
  let address = chain.address
  for (const [hop, offset] of hops.entries()) {
    const pointer = pointers[hop]
    if (pointer === undefined) return { read: address }
    address = pointer + offset
    if (!inMainRam(pointer) || !inMainRam(address, room(hop))) {
      return { fault: `${name}: hop ${String(hop)} leads out of main RAM` }
    }
  }
  return { address }
}

/** The address of the `length` bytes `chain` leads to, reading each pointer through `readWord`.
 * Every pointer must lie in main RAM with room for what follows; a fault names the hop instead
 * of an address. */
export function chainAddress(
  name: string,
  chain: PointerChain,
  length: number,
  readWord: (address: number) => number,
): ChainEnd {
  const pointers: number[] = []
  for (;;) {
    const step = chainStep(name, chain, length, pointers)
    if (!('read' in step)) return step
    pointers.push(readWord(step.read))
  }
}
