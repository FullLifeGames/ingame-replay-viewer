// The maps from Showdown's names to Black 2's numbers (#106). In Gen 5 the game
// numbers its species, moves, items and abilities as @pkmn's dex does, so a name maps through
// @pkmn's Gen 5 data; scripts/gen5-names-real.test.ts holds each number to pokebw2's constant of
// the same name under CI. Natures go by name (@pkmn numbers them in another order than the game),
// from the generated list. Pure: no number of the game is held here.
import { type Generation, Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'

import type { TeamMember } from '../../script/types.ts'
import type { PkmNumbers } from '../bw2-numbers.ts'
import type { PkmGender } from '../pkm-fields.ts'

type GenerationsDex = ConstructorParameters<typeof Generations>[0]
const gen5: Generation = new Generations(Dex as GenerationsDex).get(5)

/** The kinds of entry a name can be. */
export type NameKind = 'species' | 'move' | 'item' | 'ability'

/** Showdown's name and the name pokebw2's constant carries, for each one renamed since Gen 5.
 * The one list of names typed by hand; the typed Hidden Powers follow a rule (`gameName`). */
export const ACCEPTED_RENAMES: Readonly<Record<'move' | 'item', readonly [string, string][]>> = {
  move: [
    ['Smelling Salts', 'Smelling Salt'],
    ['Feint Attack', 'Faint Attack'],
    ['High Jump Kick', 'Hi Jump Kick'],
    ['Vise Grip', 'Vice Grip'],
  ],
  item: [
    ['Mail', 'Greet Mail'],
    ['Pretty Feather', 'Pretty Wing'],
  ],
}

function need<T>(found: T | undefined, kind: NameKind | 'nature', name: string): T {
  if (found === undefined) throw new Error(`no Gen 5 ${kind} ${name}`)
  return found
}

/** A species' base number, with the forme a name such as "Landorus-Therian" carries. */
export function gen5Species(name: string): { num: number; forme?: string } {
  const specie = need(gen5.species.get(name), 'species', name)
  const base = need(gen5.species.get(specie.baseSpecies), 'species', specie.baseSpecies)
  return specie.forme ? { num: base.num, forme: specie.forme } : { num: base.num }
}

/** A move's number; every typed Hidden Power shares the one move's. */
export const gen5Move = (name: string): number => need(gen5.moves.get(name), 'move', name).num

export const gen5Item = (name: string): number => need(gen5.items.get(name), 'item', name).num

export const gen5Ability = (name: string): number =>
  need(gen5.abilities.get(name), 'ability', name).num

/** The one normalising rule: accents dropped, letters and digits alone, upper case. */
const squashed = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()

/** Whether a constant such as SPECIES_NIDORAN_F names what Showdown calls "Nidoran-F": the same
 * letters and digits after the constant's prefix. */
export function constantMatches(constant: string, name: string): boolean {
  const rest = /^[A-Z]+?_(.+)$/.exec(constant)?.[1]
  return rest !== undefined && squashed(rest) === squashed(name)
}

const HIDDEN_POWER = need(gen5.moves.get('hiddenpower'), 'move', 'Hidden Power')

/** The name pokebw2's constant carries for a Showdown name: an accepted rename's Gen 5 name, the
 * one Hidden Power for a typed one, and the name itself otherwise. */
export function gameName(kind: NameKind, name: string): string {
  if (kind === 'move' && gen5Move(name) === HIDDEN_POWER.num) return HIDDEN_POWER.name
  const renames = kind === 'move' || kind === 'item' ? ACCEPTED_RENAMES[kind] : []
  return renames.find(([showdown]) => showdown === name)?.[1] ?? name
}

/** A nature's number in the generated list, by its constant NATURE_<name>. */
export function gen5Nature(natures: PkmNumbers['natures'], name: string): number {
  const nature = need(gen5.natures.get(name), 'nature', name)
  const constant = `NATURE_${squashed(nature.name)}`
  const found = natures[constant]
  if (found === undefined) throw new Error(`the list of natures has no ${constant}`)
  return found
}

/** The party format's gender for the battle script's; a member with none is genderless. */
export function pkmGender(gender: TeamMember['gender']): PkmGender {
  if (gender === 'M') return 'male'
  return gender === 'F' ? 'female' : 'none'
}
