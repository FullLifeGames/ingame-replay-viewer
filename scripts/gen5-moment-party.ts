// The party check of the moment script's hand scenes (#108, lane plan D9): at every mark the page
// reads the mon ID of the Pokémon behind each party slot of both clients, and at each block's
// answer the run compares those orders with the order the blocks' send-ins give. A send-in swaps
// the front's slot with the incoming Pokémon's (SC_OP_SEND_IN, BattleParty_Swap in pokebw2's
// src/battle/btl_main.c), so the order the backend keeps follows from the order read at the
// action menu. A mismatch names both orders and fails the run. The layouts come from
// build/gen5/bw2.json.
import { nameOfNumber } from '../src/gen5/backend/names.ts'
import { sendInSwap } from '../src/gen5/backend/party-state.ts'
import type { Gen5Block } from '../src/gen5/backend/replay.ts'
import { offsetOf } from '../src/gen5/battle-mons.ts'
import type { BattleNumbers } from '../src/gen5/bw2-numbers.ts'
import type { MarkRecord } from '../src/gen5/hook.ts'
import type { RamRef } from '../src/gen5/ram-check.ts'
import type { PartyReading } from './gen5-moment-read.ts'
import type { Side } from './gen5-moment-scene.ts'

/** Bytes a party slot takes: a pointer to its BattleMon. */
const SLOT = 4
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
      address: slots + slot * SLOT,
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
type Orders = Record<Side, (number | undefined)[]>

/** The state's orders after `block`'s send-ins, from `orders` before it. */
function afterBlock(orders: Record<Side, number[]>, block: Gen5Block, start: PartyStart): void {
  for (const { command, args } of block.commands) {
    if (command !== 'SC_OP_SEND_IN') continue
    const [client, pos = 0, slot = 0] = args
    const side = SIDES.find((one) => start[one].client === client)
    if (side === undefined) throw new Error(`${block.name} sends in for client ${String(client)}`)
    orders[side] = sendInSwap(orders[side], pos, slot)
  }
}

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
  const differs = SIDES.filter((side) => reads[side].some((id, slot) => id !== has[side][slot]))
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

/** One line per block at its mark `<block>-answered`: each front by species and mon ID when both
 * parties read as the state has them, else both orders of each side that differs. `matches` is
 * false on a mismatch and on a block with no mark. */
export function partyLines(
  blocks: readonly Gen5Block[],
  marks: readonly Pick<MarkRecord, 'name' | 'values'>[],
  start: PartyStart,
): { lines: string[]; matches: boolean } {
  const nameOf = speciesNames(start)
  const orders = {
    near: start.near.mons.map(({ monId }) => monId),
    far: start.far.mons.map(({ monId }) => monId),
  }
  const lines: string[] = []
  let matches = true
  for (const block of blocks) {
    afterBlock(orders, block, start)
    const name = `${block.name}-answered`
    const mark = marks.findLast((one) => one.name === name)
    const read = mark === undefined ? undefined : valuesOf(mark.values)
    const reads = (side: Side) => start[side].mons.map((_, slot) => read?.get(slotName(side, slot)))
    const checked =
      read === undefined
        ? { line: `${name}: no mark`, matches: false }
        : markLine(name, { near: reads('near'), far: reads('far') }, orders, nameOf)
    lines.push(checked.line)
    matches &&= checked.matches
  }
  return { lines, matches }
}
