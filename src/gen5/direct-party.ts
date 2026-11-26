// Both sides' parties for the direct battle start (#97, plan E-6, decision 4): the park writes each
// side's sealed Pokémon (pkm-cipher.ts) behind that client's party pointer in the battle's setup,
// one after another at the party's `pkms`, then the party's `count` and its slot byte, as
// PokeParty_AddPkm leaves a party. The setup's parties are its own copies (BtlSetup_LoadPlayerParty
// copies the game's party whole), so the game's party stays as the save or New Game left it. Pure:
// the numbers come in from build/gen5/bw2.json.
import type { EntryNumbers } from './bw2-numbers.ts'
import { entryField, entryLayout } from './entry-field.ts'
import type { RamCheck } from './ram-check.ts'
import { littleEndian, type MemoryWrite } from './ram-write.ts'
import type { RoutineLayout } from './routine-layout.ts'
import { behindSetup, OPPONENT, PLAYER, slot, width } from './setup-chain.ts'

/** Each side's sealed Pokémon, in party order, each one PartyPkm long. */
export interface PartySides {
  player: readonly Uint8Array[]
  opponent: readonly Uint8Array[]
}

type Side = keyof PartySides

const CLIENTS: Record<Side, number> = { player: PLAYER, opponent: OPPONENT }
const SIDES: readonly Side[] = ['player', 'opponent']

/** A member of a side's party, through the setup's party pointer. */
function partyRef(entry: EntryNumbers, layout: RoutineLayout, side: Side, member: string) {
  const offset = entryField(entry, 'PokeParty', member).offset
  return behindSetup(layout, [slot(entry, 'party', CLIENTS[side]), offset])
}

/** The Pokémon a party holds at most: the PartyPkms its `pkms` has room for. */
function capacity(entry: EntryNumbers): number {
  const room = entryField(entry, 'PokeParty', 'pkms').size / entryLayout(entry, 'PartyPkm').size
  if (!Number.isInteger(room) || room < 1) {
    throw new Error('PokeParty.pkms holds no whole number of PartyPkm')
  }
  return room
}

/** The writes of one side: each Pokémon at its place, then the count and the slot byte with the
 * low bit of each filled slot set. */
function sideWrites(
  entry: EntryNumbers,
  layout: RoutineLayout,
  side: Side,
  pkms: readonly Uint8Array[],
) {
  if (pkms.length === 0) throw new Error(`the ${side}'s party holds no Pokémon`)
  if (pkms.length > capacity(entry)) {
    throw new Error(`the ${side}'s party holds more Pokémon than its capacity`)
  }
  const size = entryLayout(entry, 'PartyPkm').size
  const { address, hops } = partyRef(entry, layout, side, 'pkms')
  const placed = pkms.map((bytes, i): MemoryWrite => {
    const field = `${side}.party.pkms[${String(i)}]`
    if (bytes.length !== size) throw new Error(`${field} is not one PartyPkm long`)
    const at = hops.map((hop, k) => (k === hops.length - 1 ? hop + i * size : hop))
    return { kind: 'bytes', field, address, hops: at, bytes: [...bytes] }
  })
  const number = (member: string, value: number): MemoryWrite => {
    const field = `${side}.party.${member}`
    const { size: bytes } = entryField(entry, 'PokeParty', member)
    return {
      kind: 'bytes',
      field,
      ...partyRef(entry, layout, side, member),
      bytes: littleEndian(value, bytes, field),
    }
  }
  return [...placed, number('count', pkms.length), number('slotExists', 2 ** pkms.length - 1)]
}

/** Every write of both parties: the player's side first. */
export function partyWrites(
  entry: EntryNumbers,
  layout: RoutineLayout,
  parties: PartySides,
): MemoryWrite[] {
  return SIDES.flatMap((side) => sideWrites(entry, layout, side, parties[side]))
}

/** A side's party member as a check of its width. */
function partyCheck(entry: EntryNumbers, layout: RoutineLayout, side: Side, member: string) {
  return {
    name: `${side}.party.${member}`,
    ...partyRef(entry, layout, side, member),
    width: width(entryField(entry, 'PokeParty', member), `PokeParty.${member}`),
  }
}

/** What must hold of the parties before the park writes: each has the room of a full party, and
 * the opponent's holds no Pokémon. The player's count goes unchecked: with no save it is 0, with
 * a save the save's. */
export function partyChecks(entry: EntryNumbers, layout: RoutineLayout): RamCheck[] {
  const room = capacity(entry)
  return [
    { ...partyCheck(entry, layout, 'player', 'capacity'), oneOf: [room] },
    { ...partyCheck(entry, layout, 'opponent', 'capacity'), oneOf: [room] },
    { ...partyCheck(entry, layout, 'opponent', 'count'), oneOf: [0] },
  ]
}

/** Each side's count as the park wrote it, for the read-back after the write. */
export function partyCounts(
  entry: EntryNumbers,
  layout: RoutineLayout,
  parties: PartySides,
): RamCheck[] {
  return SIDES.map((side) => ({
    ...partyCheck(entry, layout, side, 'count'),
    oneOf: [parties[side].length],
  }))
}
