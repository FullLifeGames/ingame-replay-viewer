// The generic move for a move the expansion lacks (plan §4, ruling D10): the lowest-numbered
// expansion move with the same @pkmn type and category. Computed from the data, no hand list.
import { Dex } from '@pkmn/dex'

import { Gen3Error } from '../errors'

export interface GenericMove {
  readonly number: number
  readonly name: string
}

/** `numberOf` gives a move's expansion number by its @pkmn name, or undefined when it has none. */
export function genericMove(
  type: string,
  category: string,
  numberOf: (name: string) => number | undefined,
): GenericMove {
  let best: GenericMove | undefined
  for (const move of Dex.moves.all()) {
    if (move.type !== type || move.category !== category) continue
    const number = numberOf(move.name)
    if (number !== undefined && (best === undefined || number < best.number)) {
      best = { number, name: move.name }
    }
  }
  if (best === undefined) throw new Gen3Error(`no expansion move is ${type} and ${category}`)
  return best
}
