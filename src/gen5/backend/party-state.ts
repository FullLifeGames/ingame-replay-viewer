// The party order that Black 2's battle keeps for each side while a Gen 5 replay plays (#108,
// lane plan D1). The order starts as `partyOrder` gives it. Each send-in swaps the front's slot
// with the incoming Pokémon's, as ServerControl_SwitchInCore does on the server and
// BattleClient_ScOpSendIn on the client, both through BattleParty_Swap in pokebw2's
// src/battle/btl_main.c. A fainted Pokémon keeps its place until the next send-in. When Illusion's
// disguise ends, the game keeps the disguise's Pokémon in place, and the real one is its alias
// until it leaves (lane plan D8). A send-in that the game's party cannot follow fails by its log
// line and species.
import type { BattleScript } from '../../script/events.ts'
import type { PokemonRef, Side } from '../../script/types.ts'
import type { EventOf } from './rules.ts'
import { partyOrder, refKey } from './slots.ts'

/** The party slot of the Pokémon in place: in a single battle slot 0 is the front, and the
 * place within its client that SC_OP_SEND_IN and SC_SEND_OUT name. */
export const FRONT_SLOT = 0

/** What a send-in did to the party: the incoming Pokémon's slot before the swap, and the
 * Pokémon it sent back; none after a faint. */
interface SentIn {
  readonly slot: number
  readonly out?: PokemonRef
}

export interface PartyState {
  /** The side's team indices in the game's party order. */
  order(side: Side): readonly number[]
  /** The Pokémon in place on `side`, fainted or not. */
  front(side: Side): PokemonRef
  /** Swaps the incoming Pokémon to the front; throws by name where the game cannot follow. */
  sendIn(event: EventOf<'switchIn'>): SentIn
  /** Marks `ref` fainted, or the Pokémon it is the alias of: it stays in place until the next
   * send-in and never comes back. */
  faint(ref: PokemonRef): void
  /** Follows the end of a disguise: the real Pokémon becomes the alias of the one in place until
   * it leaves; throws by name when the disguise does not stand in place. */
  alias(event: EventOf<'replace'>): void
  /** The Pokémon the game holds for `ref`: the one in place for its alias, else `ref`. */
  gameRef(ref: PokemonRef): PokemonRef
}

/** BattleParty_Swap: a copy of `order` with the entries at `pos` and `slot` swapped. */
export function sendInSwap(order: readonly number[], pos: number, slot: number): number[] {
  const [atPos, atSlot] = [order[pos], order[slot]]
  if (atPos === undefined || atSlot === undefined) {
    const missing = atPos === undefined ? pos : slot
    throw new Error(`the party of ${String(order.length)} has no slot ${String(missing)}`)
  }
  const swapped = [...order]
  swapped[pos] = atSlot
  swapped[slot] = atPos
  return swapped
}

/** The species of a battle script's Pokémon, by which an error names it. */
export function speciesOf(script: Pick<BattleScript, 'teams'>, ref: PokemonRef): string {
  return script.teams[ref.side][ref.index]?.species ?? `Pokémon ${String(ref.index)}`
}

/** What the refusals read: the script's teams, each side's order, the fainted Pokémon, and each
 * side's alias by the real Pokémon's team index. */
interface Party {
  readonly script: Pick<BattleScript, 'teams'>
  readonly orders: Readonly<Record<Side, readonly number[]>>
  readonly fainted: ReadonlySet<string>
  readonly aliases: ReadonlyMap<Side, number>
}

const frontOf = (party: Party, side: Side): PokemonRef => ({
  side,
  index: party.orders[side][FRONT_SLOT] ?? -1,
})

/** The Pokémon the game holds for `ref`: the side's front for the side's alias, else `ref`. */
const gameRefOf = (party: Party, ref: PokemonRef): PokemonRef =>
  party.aliases.get(ref.side) === ref.index ? frontOf(party, ref.side) : ref

/** Why the game cannot send in `who`: no such Pokémon, in place already, or fainted. */
function inRefusal(party: Party, who: PokemonRef): string | undefined {
  const slot = party.orders[who.side].indexOf(who.index)
  if (slot === -1) return `the ${who.side} side’s party holds no Pokémon ${String(who.index)}`
  const name = speciesOf(party.script, who)
  if (slot === FRONT_SLOT) return `the log sends in ${name}, which the game holds in place already`
  return party.fainted.has(refKey(who)) ? `the log sends in ${name}, which fainted` : undefined
}

/** Why the game cannot send back `replaces`: the log's Pokémon sent back is not the game's
 * front, or the log sends back none while the front has not fainted, or one after a faint. */
function backRefusal(party: Party, event: EventOf<'switchIn'>): string | undefined {
  const held = frontOf(party, event.who.side)
  const back = party.fainted.has(refKey(held)) ? undefined : held
  const { replaces } = event
  const sentBack = replaces && gameRefOf(party, replaces)
  if (sentBack?.index === back?.index) return undefined
  const sent = replaces === undefined ? 'no Pokémon' : speciesOf(party.script, replaces)
  const name = speciesOf(party.script, held)
  const holds = back === undefined ? `${name}, which fainted` : `${name} in place`
  return `the log sends back ${sent}; the game holds ${holds}`
}

/** The party state of `script`'s sides at the battle's start. */
export function partyState(script: Pick<BattleScript, 'teams' | 'events'>): PartyState {
  const start = partyOrder(script)
  const orders: Record<Side, readonly number[]> = { near: start.near, far: start.far }
  const fainted = new Set<string>()
  const aliases = new Map<Side, number>()
  const party: Party = { script, orders, fainted, aliases }
  return {
    order: (side) => orders[side],
    front: (side) => frontOf(party, side),
    sendIn(event) {
      const why = inRefusal(party, event.who) ?? backRefusal(party, event)
      if (why !== undefined) throw new Error(`line ${String(event.line)}: ${why}`)
      const { side, index } = event.who
      const out = frontOf(party, side)
      const slot = orders[side].indexOf(index)
      orders[side] = sendInSwap(orders[side], FRONT_SLOT, slot)
      aliases.delete(side)
      return fainted.has(refKey(out)) ? { slot } : { slot, out }
    },
    faint(ref) {
      fainted.add(refKey(gameRefOf(party, ref)))
    },
    alias(event) {
      const { side } = event.who
      const held = frontOf(party, side)
      if (gameRefOf(party, event.replaces).index !== held.index) {
        const ends = speciesOf(script, event.replaces)
        const why = `the log ends the disguise of ${ends}; the game holds ${speciesOf(script, held)}`
        throw new Error(`line ${String(event.line)}: ${why} in place`)
      }
      aliases.set(side, event.who.index)
    },
    gameRef: (ref) => gameRefOf(party, ref),
  }
}
