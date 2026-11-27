// A party's Pokémon by Showdown's names (#106), and the one way from it to a written Pokémon and
// on to the sealed bytes the park writes. Numbers come from the maps of names.ts, stats and PP
// from @pkmn: full IVs, no EVs, the member's level and nature. Every form is 0 and exp is 0, whose
// bar stays empty. Pure: the only numbers of the game come in with the format.
import type { StatID } from '@pkmn/data'

import type { TeamMember } from '../../script/types.ts'
import type { PartySides } from '../direct-party.ts'
import { sealPkm } from '../pkm-cipher.ts'
import { plainPkm, type WrittenPkm } from '../pkm-fields.ts'
import type { PkmFormat } from '../pkm-members.ts'
import {
  baseSpecie,
  gen5,
  gen5Ability,
  gen5Item,
  gen5Move,
  gen5Nature,
  gen5Species,
  moveEntry,
  natureEntry,
  pkmGender,
} from './names.ts'

/** A Pokémon of a party, every entry by its Showdown name. */
export interface PartyMon {
  species: string
  /** The name shown: a nickname, or the species' name. */
  name: string
  nicknamed: boolean
  level: number
  /** None for a genderless Pokémon. */
  gender?: TeamMember['gender']
  shiny: boolean
  nature: string
  ability: string
  /** None writes the format's ITEM_NONE. */
  item?: string
  moves: readonly string[]
}

/** How `writtenMon` writes one Pokémon. */
export interface WriteOptions {
  /** The original trainer; `gender` is the bit as PlayerInfo keeps it. */
  ot: WrittenPkm['ot']
  /** Sets the Pokémon's PID apart from the rest of its party. */
  salt: number
  format: PkmFormat
  /** Both HP and max HP, when given; else the max HP that @pkmn calculates. */
  hp?: number
}

/** A trainer as the original trainer of its party: id 0 and gender 0, as PlayerInfo holds them
 * with no save. */
export const trainerOt = (name: string): WrittenPkm['ot'] => ({ name, id: 0, gender: 0 })

/** Every IV at its top, as @pkmn counts it; the IV members hold it in their five bits. */
const FULL_IV = 31
/** The friendship most species start with. */
const FRIENDSHIP = 70

function noItem(format: PkmFormat): number {
  const found = format.pkm.items.ITEM_NONE
  if (found === undefined) throw new Error('the list of items has no ITEM_NONE')
  return found
}

/** One Pokémon as the encoder takes it. Its stats are its base form's, as form 0 is written. */
export function writtenMon(mon: PartyMon, options: WriteOptions): WrittenPkm {
  const { ot, salt, format } = options
  const base = baseSpecie(mon.species).baseStats
  const nature = natureEntry(mon.nature)
  const stat = (key: StatID) => gen5.stats.calc(key, base[key], FULL_IV, 0, mon.level, nature)
  const maxHp = options.hp ?? stat('hp')
  return {
    species: gen5Species(mon.species).num,
    form: 0,
    level: mon.level,
    exp: 0,
    gender: pkmGender(mon.gender),
    shiny: mon.shiny,
    nature: gen5Nature(format.pkm.natures, mon.nature),
    ability: gen5Ability(mon.ability),
    item: mon.item === undefined ? noItem(format) : gen5Item(mon.item),
    friendship: FRIENDSHIP,
    moves: mon.moves.map((name) => ({ move: gen5Move(name), pp: moveEntry(name).pp, ppUps: 0 })),
    ivs: { hp: FULL_IV, atk: FULL_IV, def: FULL_IV, spe: FULL_IV, spa: FULL_IV, spd: FULL_IV },
    name: mon.name,
    nicknamed: mon.nicknamed,
    ot,
    hp: maxHp,
    maxHp,
    stats: {
      atk: stat('atk'),
      def: stat('def'),
      spe: stat('spe'),
      spa: stat('spa'),
      spd: stat('spd'),
    },
    salt,
  }
}

/** Each side's Pokémon as written, in party order. */
export type WrittenSides = Readonly<Record<keyof PartySides, readonly WrittenPkm[]>>

/** Both sides' parties as the park takes them, each Pokémon sealed, with a log line per name cut
 * to its room, which names the side and the slot. */
export function sealParties(
  written: WrittenSides,
  format: PkmFormat,
): { parties: PartySides; notes: string[] } {
  const notes: string[] = []
  const seal = (side: keyof PartySides) =>
    written[side].map((one, i) => {
      const { bytes, cuts } = plainPkm(one, format)
      notes.push(...cuts.map((cut) => `${side}.party.pkms[${String(i)}] ${cut}`))
      return sealPkm(bytes, format.pkm)
    })
  const player = seal('player')
  return { parties: { player, opponent: seal('opponent') }, notes }
}
