// The charge turns of the two-turn moves (#65): `charge-turns.json`, which `npm run gen3:tables`
// writes from the pinned `gMovesInfo` (`scripts/gen3-charge.ts`).
import turns from './charge-turns.json'
import { constantOf } from './lookup'

interface ChargeTurn {
  /** The string of `battle_message.c` that the charge turn says. */
  readonly stringId: string
  /** Whether the charge plays its animation before its line. */
  readonly animationFirst: boolean
}

const TURNS: Readonly<Partial<Record<string, ChargeTurn>>> = turns

/** The charge turn of a move by its @pkmn name; undefined where the expansion gives it none. */
export const chargeTurnOf = (move: string): ChargeTurn | undefined =>
  TURNS[constantOf('MOVE', move)]
