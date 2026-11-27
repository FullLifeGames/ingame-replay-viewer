// The party check of the moment script's hand scenes (#108, lane plan D9): at every mark the page
// reads the mon ID of the Pokémon behind each party slot of both clients, and at each block's
// answer the run compares those orders with the order the backend's battle state holds after the
// block's last line (the writer's `orders`). The game swaps its party on each SC_OP_SEND_IN
// (BattleParty_Swap in pokebw2's src/battle/btl_main.c), so a send-in whose slot differs from the
// state's swap shows here. A mismatch names both orders and fails the run. The layouts come from
// build/gen5/bw2.json.
import { nameOfNumber } from '../src/gen5/backend/names.ts'
import type { PartyOrders } from '../src/gen5/backend/moves.ts'
import type { Gen5Block } from '../src/gen5/backend/replay.ts'
import { offsetOf, slotAddress } from '../src/gen5/battle-mons.ts'
import type { BattleNumbers } from '../src/gen5/bw2-numbers.ts'
import type { MarkRecord } from '../src/gen5/hook.ts'
import type { RamRef } from '../src/gen5/ram-check.ts'
import type { PartyReading } from './gen5-moment-read.ts'
import type { Side } from './gen5-moment-scene.ts'

const SIDES: readonly Side[] = ['near', 'far']

/** Each side's party as read at the action menu: its client, its first slot and its Pokémon. */
export type PartyStart = Record<
  Side,
  Pick<PartyReading, 'client' | 'slots'> & {
    readonly mons: readonly { readonly monId: number; readonly species: number }[]
  }
>

const slotName = (side: Side, slot: number) => `${side}.slot${String(slot)}`

/** One ref per party slot of each client: the slot's pointer, then a hop to the mon ID of the
 * BattleMonCore it points at, one byte. */
export function partyRefs(
  battle: { readonly parties: PartyStart },
  numbers: { readonly battle: BattleNumbers },
): RamRef[] {
  const monId = offsetOf(numbers.battle.monCore, 'monId', 'BattleMonCore')
  return SIDES.flatMap((side) => {
    const { slots, mons } = battle.parties[side]
    return mons.map((_, slot) => ({
      name: slotName(side, slot),
      address: slotAddress(slots, slot),
      hops: [monId],
      width: 1 as const,
    }))
  })
}

/** A mark's values (`name=0x…`, one per ref that led somewhere) by name. */
function valuesOf(values: string): Map<string, number> {
  const pairs = values
    .split(' ')
    .filter((part) => part.includes('='))
    .map((part) => {
      const [name = '', value = ''] = part.split('=')
      return [name, Number(value)] as const
    })
  return new Map(pairs)
}

/** Each side's mon IDs in party order; `undefined` where a slot's pointer led nowhere. */
type Orders = Record<Side, readonly (number | undefined)[]>

/** A mon ID's species name, as read at the action menu. */
function speciesNames(start: PartyStart): (monId: number | undefined) => string {
  const species = new Map(
    SIDES.flatMap((side) => start[side].mons.map((mon) => [mon.monId, mon.species] as const)),
  )
  return (monId) => {
    const num = monId === undefined ? undefined : species.get(monId)
    return (num === undefined ? undefined : nameOfNumber('species', num)) ?? '?'
  }
}

/** The line of a block's mark: both orders of each side that reads other than the state has it,
 * or each front by species and mon ID. */
function markLine(name: string, reads: Orders, has: Orders, nameOf: (monId?: number) => string) {
  const listed = (ids: readonly (number | undefined)[]) =>
    ids.map((id) => (id === undefined ? 'none' : `${nameOf(id)} ${String(id)}`)).join(', ')
  const differs = SIDES.filter(
    (side) =>
      reads[side].length !== has[side].length ||
      reads[side].some((id, slot) => id !== has[side][slot]),
  )
  if (differs.length > 0) {
    const sides = differs.map(
      (side) => `${side} party reads ${listed(reads[side])}; the state has ${listed(has[side])}`,
    )
    return { line: `${name}: ${sides.join('; ')}`, matches: false }
  }
  const fronts = SIDES.map((side) => {
    const front = has[side][0]
    return `${side} front ${nameOf(front)}, mon ID ${String(front)}`
  })
  return {
    line: `${name}: ${fronts.join('; ')}; both parties as the state has them`,
    matches: true,
  }
}

/** The line of a block's mark: its orders read from RAM against the state's after the block's
 * last line. */
function blockLine(
  block: Gen5Block,
  read: Map<string, number> | undefined,
  has: PartyOrders | undefined,
  start: PartyStart,
) {
  const name = `${block.name}-answered`
  if (read === undefined) return { line: `${name}: no mark`, matches: false }
  if (has === undefined) {
    const line = `${name}: the state holds no party order after line ${String(block.lines.at(-1))}`
    return { line, matches: false }
  }
  const reads = (side: Side) => start[side].mons.map((_, slot) => read.get(slotName(side, slot)))
  return markLine(name, { near: reads('near'), far: reads('far') }, has, speciesNames(start))
}

/** One line per block at its mark `<block>-answered`: each front by species and mon ID when both
 * parties read as the state has them after the block's last line (`orders`, the writer's), else
 * both orders of each side that differs. `matches` is false on a mismatch, on a block with no
 * mark and on a block whose last line has no order. */
export function partyLines(
  blocks: readonly Gen5Block[],
  marks: readonly Pick<MarkRecord, 'name' | 'values'>[],
  start: PartyStart,
  orders: readonly PartyOrders[],
): { lines: string[]; matches: boolean } {
  const checked = blocks.map((block) => {
    const mark = marks.findLast((one) => one.name === `${block.name}-answered`)
    const has = orders.findLast((one) => one.line === block.lines.at(-1))
    return blockLine(block, mark && valuesOf(mark.values), has, start)
  })
  return {
    lines: checked.map(({ line }) => line),
    matches: checked.every(({ matches }) => matches),
  }
}
