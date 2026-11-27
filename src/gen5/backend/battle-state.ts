// What the game holds of a battle script's Pokémon while a Gen 5 replay plays (#107, #108, lane
// plan D1, D5, D6, D13): which of them stand in the battle's places, by which mon ID and position
// the commands name them, and the HP the game shows for each. The places follow the party state
// (party-state.ts): each side's front, fainted or not. Every Pokémon keeps the mon ID of its start
// slot through every swap, as PokeCon_CreateClientParty gives it once. The real Pokémon behind
// Illusion's disguise answers for the disguise's Pokémon, by its mon ID and its HP, until it leaves
// (lane plan D8). Every Pokémon starts at HP_SCALE, and each HP change runs from the game's HP to
// the logged one on that scale.
// Pure: the clients and mon IDs come from build/gen5/bw2.json's `battle`.
import type { BattleScript } from '../../script/events.ts'
import { HP_SCALE, scaleHp } from '../../script/hp-scale.ts'
import type { HpFraction, PokemonRef, Side } from '../../script/types.ts'
import { singleBattlePos } from '../battle-mons.ts'
import type { BattleNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { partyState, speciesOf } from './party-state.ts'
import type { EventOf } from './rules.ts'
import { clientOf, monIdOf, partyOrder, partySlot, refKey } from './slots.ts'

/** A Pokémon in one of the battle's places: the mon ID and the position the commands name. */
export interface InPlace {
  readonly monId: number
  readonly pos: number
}

/** What a send-in names: the side's client, the incoming Pokémon's party slot before the swap,
 * and the Pokémon it sends back, in place until then; none after a faint. */
export interface SendIn {
  readonly client: number
  readonly slot: number
  readonly out?: InPlace & { readonly ref: PokemonRef }
}

export interface BattleState {
  /** `ref`'s mon ID and position when it stands in the game's place, else undefined. */
  inPlace(ref: PokemonRef): InPlace | undefined
  /** `ref`'s place, which the event of log line `line` names; throws by name when the game does
   * not hold `ref` in place (lane plan D1). */
  placed(ref: PokemonRef, line: number): InPlace
  /** Follows a switch-in after the leads; throws by name where the game's party cannot. */
  sendIn(event: EventOf<'switchIn'>): SendIn
  /** Follows a faint: the HP goes to 0, and the Pokémon stays in place until the next send-in. */
  faint(ref: PokemonRef): void
  /** Follows the end of a disguise: the real Pokémon plays as the disguise's until it leaves. */
  alias(event: EventOf<'replace'>): void
  /** The HP the game shows for `ref`, on the scale. */
  hpOf(ref: PokemonRef): number
  /** The side's party in the game's order, by mon ID. */
  partyMonIds(side: Side): number[]
  /** The command that takes `ref`'s HP in the game to `after` on the scale (SC_OP_SUBTRACT_HP or
   * SC_OP_ADD_HP, as ServerDisplay_DecreaseHP and ServerDisplay_SimpleHP send them), and the
   * game's HP with it; undefined when the HP stays. */
  hpTo(ref: PokemonRef, after: HpFraction): ServerCommand | undefined
}

/** The state of `script`'s Pokémon at the battle's start. */
export function battleState(
  script: Pick<BattleScript, 'teams' | 'events'>,
  battle: Pick<BattleNumbers, 'single' | 'monIds'>,
): BattleState {
  const start = partyOrder(script)
  const party = partyState(script)
  const hp = new Map<string, number>()
  const monIdAt = (ref: PokemonRef) =>
    monIdOf(battle.monIds, clientOf(battle.single, ref.side), partySlot(start, ref))
  const monIdOfRef = (ref: PokemonRef) => monIdAt(party.gameRef(ref))
  const hpKey = (ref: PokemonRef) => refKey(party.gameRef(ref))
  const placeOf = (ref: PokemonRef): InPlace => ({
    monId: monIdOfRef(ref),
    pos: singleBattlePos(battle.single, clientOf(battle.single, ref.side)),
  })
  const hpOf = (ref: PokemonRef) => hp.get(hpKey(ref)) ?? HP_SCALE
  const inPlace = (ref: PokemonRef) =>
    party.front(ref.side).index === party.gameRef(ref).index ? placeOf(ref) : undefined
  return {
    inPlace,
    placed(ref, line) {
      const place = inPlace(ref)
      if (place !== undefined) return place
      const name = speciesOf(script, ref)
      throw new Error(
        `line ${String(line)}: the log names ${name}, which the game does not hold in place`,
      )
    },
    sendIn(event) {
      const { slot, out } = party.sendIn(event)
      const client = clientOf(battle.single, event.who.side)
      return out === undefined
        ? { client, slot }
        : { client, slot, out: { ...placeOf(out), ref: out } }
    },
    faint(ref) {
      party.faint(ref)
      hp.set(hpKey(ref), 0)
    },
    alias: (event) => {
      party.alias(event)
    },
    hpOf,
    partyMonIds: (side) => party.order(side).map((index) => monIdAt({ side, index })),
    hpTo(ref, after) {
      const from = hpOf(ref)
      const to = scaleHp(after)
      hp.set(hpKey(ref), to)
      if (to === from) return undefined
      const command = to < from ? 'SC_OP_SUBTRACT_HP' : 'SC_OP_ADD_HP'
      return { command, args: [monIdOfRef(ref), Math.abs(from - to)] }
    },
  }
}
