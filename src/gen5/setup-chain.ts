// Chains into the battle's setup for the direct battle start (#97): the routine keeps the setup it
// built in its block's `setup` word, and every write and check of the park starts there. The
// setup's pointer arrays hold one element per side, the player's and the opponent's, each at the
// side's setup index (#93). Pure: the numbers come in from build/gen5/bw2.json.
import type { EntryNumbers, FieldLayout, Sides } from './bw2-numbers.ts'
import { entryField } from './entry-field.ts'
import type { PointerChain } from './ram-chain.ts'
import { blockAddress, type RoutineLayout } from './routine-layout.ts'

/** A side of the setup: the player's or the opponent's. */
export type SetupSide = keyof Sides

/** Bytes a pointer takes. */
export const WORD = 4

/** A chain from the block's setup word, its hops spelled out. */
export type SetupChain = PointerChain & { hops: readonly number[] }

/** The chain from the block's setup word through `hops`. */
export function behindSetup(layout: RoutineLayout, hops: readonly number[]): SetupChain {
  return { address: blockAddress(layout, 'setup'), hops }
}

/** The offset of `side`'s element of the setup's pointer array `member`. */
export const slot = (entry: EntryNumbers, member: string, side: SetupSide) =>
  entryField(entry, 'BtlSetup', member).offset + entry.setupIndices[side] * WORD

/** The width a check reads `field` with; throws when it is no byte, halfword or word. */
export const width = (field: FieldLayout, name: string): 1 | 2 | 4 => {
  if (field.size === 1 || field.size === 2 || field.size === 4) return field.size
  throw new Error(`${name} fills no byte, halfword or word`)
}
