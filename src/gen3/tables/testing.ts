// Spec helpers for the tables: @pkmn's data by generation, and the items the expansion lacks.
import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'

type GenerationsDex = ConstructorParameters<typeof Generations>[0]

/** @pkmn's data, one generation at a time. */
export const gens = new Generations(Dex as GenerationsDex)

/** The names of a list of @pkmn's entries. */
export const names = (list: Iterable<{ readonly name: string }>) =>
  [...list].map((entry) => entry.name)

// The expansion has every item that a generation from 3 on has, except the plain Mail: it has
// the Gen 3 mails by their own names. Of the items @pkmn keeps in Gen 2 alone, it carries
// Berserk Gene (ITEM_BERSERK_GENE) and none of the others.
const EXPANSION_KEEPS = ['Berserk Gene']

/**
 * The items of a generation that the expansion lacks: Mail, and the Gen 2 items no later
 * generation kept, apart from the one the expansion keeps.
 */
export function itemGaps(gen: number): string[] {
  const later = [3, 4, 5, 6, 7, 8, 9].map((number) => gens.get(number))
  const items = names(gens.get(gen).items)
  const gen2Only = (name: string) => later.every((data) => data.items.get(name) === undefined)
  return items.filter(
    (name) => name === 'Mail' || (gen2Only(name) && !EXPANSION_KEEPS.includes(name)),
  )
}
