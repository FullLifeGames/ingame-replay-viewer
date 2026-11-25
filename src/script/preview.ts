// Team Preview (#87): from Gen 5 on a battle log names both teams of six before the first
// send-out. The client keeps them in `side.team` in the log's order, and the script copies them at
// `|teampreview|`, before a send-out reveals a hidden forme or a nickname. The page lists them.

import type { Battle, Pokemon } from '@pkmn/client'

import { bySide } from './refs'
import type { Preview, PreviewMember } from './types'

/** The gender a log line gives, as a part to spread; none for a genderless Pokémon. */
export const genderOf = ({ gender }: Pokemon): { readonly gender?: 'M' | 'F' } =>
  gender === 'M' || gender === 'F' ? { gender } : {}

/** A preview member by @pkmn's species name, never a hand list. */
const previewMemberOf = (pokemon: Pokemon): PreviewMember => ({
  species: pokemon.species.name,
  ...genderOf(pokemon),
  level: pokemon.level,
})

/** The teams of Team Preview, as the client holds them once it added `|teampreview|`. */
export function previewOf(battle: Battle): Preview {
  return bySide(battle, (side) => side.team.map(previewMemberOf))
}
