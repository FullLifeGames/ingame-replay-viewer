// What the game holds of a battle script's Pokémon while a Gen 5 replay plays (#107, lane plan D5,
// D6, D13): which of them stand in the battle's places, by which mon ID and position the commands
// name them, and the HP the game shows for each. Until switches play (#108) the game keeps each
// side's lead in place, the Pokémon in party slot 0, whatever the log sends in. Every Pokémon
// starts at HP_SCALE, and each HP change runs from the game's HP to the logged one on that scale.
// Pure: the clients and mon IDs come from build/gen5/bw2.json's `battle`.
import type { BattleScript } from '../../script/events.ts'
import { HP_SCALE, scaleHp } from '../../script/hp-scale.ts'
import type { HpFraction, PokemonRef } from '../../script/types.ts'
import { singleBattlePos } from '../battle-mons.ts'
import type { BattleNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { clientOf, monIdOf, partyOrder, partySlot, refKey } from './slots.ts'

/** A Pokémon in one of the battle's places: the mon ID and the position the commands name. */
export interface InPlace {
  readonly monId: number
  readonly pos: number
}

export interface BattleState {
  /** `ref`'s mon ID and position when it stands in the game's place, else undefined. */
  inPlace(ref: PokemonRef): InPlace | undefined
  /** The command that takes `ref`'s HP in the game to `after` on the scale (SC_OP_SUBTRACT_HP or
   * SC_OP_ADD_HP, as ServerDisplay_DecreaseHP and ServerDisplay_SimpleHP send them), and the
   * game's HP with it; undefined when the HP stays. */
  hpTo(ref: PokemonRef, after: HpFraction): ServerCommand | undefined
}

/** The party slot of the Pokémon in place, the one the game sends out first. */
const PLACED_SLOT = 0

/** The state of `script`'s Pokémon at the battle's start. */
export function battleState(
  script: Pick<BattleScript, 'teams' | 'events'>,
  battle: Pick<BattleNumbers, 'single' | 'monIds'>,
): BattleState {
  const order = partyOrder(script)
  const hp = new Map<string, number>()
  const monIdOfRef = (ref: PokemonRef) =>
    monIdOf(battle.monIds, clientOf(battle.single, ref.side), partySlot(order, ref))
  return {
    inPlace(ref) {
      if (partySlot(order, ref) !== PLACED_SLOT) return undefined
      const pos = singleBattlePos(battle.single, clientOf(battle.single, ref.side))
      return { monId: monIdOfRef(ref), pos }
    },
    hpTo(ref, after) {
      const from = hp.get(refKey(ref)) ?? HP_SCALE
      const to = scaleHp(after)
      hp.set(refKey(ref), to)
      if (to === from) return undefined
      const command = to < from ? 'SC_OP_SUBTRACT_HP' : 'SC_OP_ADD_HP'
      return { command, args: [monIdOfRef(ref), Math.abs(from - to)] }
    },
  }
}
