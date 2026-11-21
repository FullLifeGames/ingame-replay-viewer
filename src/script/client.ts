import { Battle } from '@pkmn/client'
import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'

// @pkmn/dex declares optional fields that exactOptionalPropertyTypes reads as not matching
// @pkmn/data's Dex. The runtime objects match; the cast stays in this one place.
type GenerationsDex = ConstructorParameters<typeof Generations>[0]

/** A fresh @pkmn/client battle over the full dex; `|gen|` switches it to the log's generation. */
export function newBattle(): Battle {
  // @pkmn/client 0.7.4 pins @pkmn/data ^0.10 and types its Battle against that copy; our
  // 0.11 Generations has the same shape (plan D2).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- see above
  return new Battle(new Generations(Dex as GenerationsDex))
}
