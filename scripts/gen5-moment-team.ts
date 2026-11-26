// The team of the moment script's direct start (#97, plan E-6, decision 6): six Pokémon a side,
// named by pokebw2's constant names, as the park writes them into both parties of a run with or
// without a save. The numbers of those names come from build/gen5/bw2.json's lists; PP and stats
// come from @pkmn by the game's numbers (in Gen 5 a species' and a move's number are the dex
// numbers): full IVs, no EVs, the listed nature, level 50. Every form is 0, and exp is 0, whose
// bar the runs show (decision 9). No shiny, no status, no Illusion or Transform user. Both leads
// know Tackle for the scene "known", and neither is the save's Tepig.
import { Generations, type Move, type Specie, type StatID } from '@pkmn/data'
import { Dex } from '@pkmn/dex'

import type { PkmNumbers } from '../src/gen5/bw2-numbers.ts'
import type { PartySides } from '../src/gen5/direct-party.ts'
import type { ParkNames } from '../src/gen5/direct-park.ts'
import { sealPkm } from '../src/gen5/pkm-cipher.ts'
import { plainPkm, type PkmGender, type WrittenPkm } from '../src/gen5/pkm-fields.ts'
import type { PkmFormat } from '../src/gen5/pkm-members.ts'

/** A Pokémon of the team by pokebw2's names; with no nickname it shows its species' name. */
export interface TeamMon {
  species: string
  nickname?: string
  gender: PkmGender
  nature: string
  ability: string
  item: string
  moves: readonly string[]
}

const SIDES = ['player', 'opponent'] as const
type TeamSide = (typeof SIDES)[number]
export type Team = Record<TeamSide, readonly TeamMon[]>

/** The team: what each one exercises is in the lane's ledger (step E-6d). */
export const TEAM: Team = {
  player: [
    {
      species: 'SPECIES_OSHAWOTT',
      nickname: 'Shellshocker',
      gender: 'male',
      nature: 'NATURE_MODEST',
      ability: 'ABILITY_TORRENT',
      item: 'ITEM_ORAN_BERRY',
      moves: ['MOVE_TACKLE', 'MOVE_WATER_GUN', 'MOVE_TAIL_WHIP', 'MOVE_HYDRO_PUMP'],
    },
    {
      species: 'SPECIES_PIKACHU',
      gender: 'female',
      nature: 'NATURE_TIMID',
      ability: 'ABILITY_STATIC',
      item: 'ITEM_LIGHT_BALL',
      moves: ['MOVE_THUNDERBOLT', 'MOVE_QUICK_ATTACK', 'MOVE_IRON_TAIL', 'MOVE_VOLT_TACKLE'],
    },
    {
      species: 'SPECIES_ROTOM',
      gender: 'none',
      nature: 'NATURE_CALM',
      ability: 'ABILITY_LEVITATE',
      item: 'ITEM_LEFTOVERS',
      moves: ['MOVE_THUNDERBOLT', 'MOVE_SHADOW_BALL', 'MOVE_THUNDER_WAVE', 'MOVE_HEX'],
    },
    {
      species: 'SPECIES_LUCARIO',
      gender: 'male',
      nature: 'NATURE_JOLLY',
      ability: 'ABILITY_STEADFAST',
      item: 'ITEM_LIFE_ORB',
      moves: ['MOVE_AURA_SPHERE', 'MOVE_CLOSE_COMBAT', 'MOVE_EXTREME_SPEED', 'MOVE_SWORDS_DANCE'],
    },
    {
      species: 'SPECIES_GYARADOS',
      gender: 'male',
      nature: 'NATURE_ADAMANT',
      ability: 'ABILITY_INTIMIDATE',
      item: 'ITEM_MYSTIC_WATER',
      moves: ['MOVE_WATERFALL', 'MOVE_DRAGON_DANCE', 'MOVE_ICE_FANG', 'MOVE_EARTHQUAKE'],
    },
    {
      species: 'SPECIES_FERROTHORN',
      gender: 'female',
      nature: 'NATURE_IMPISH',
      ability: 'ABILITY_IRON_BARBS',
      item: 'ITEM_ROCKY_HELMET',
      moves: ['MOVE_POWER_WHIP', 'MOVE_GYRO_BALL', 'MOVE_LEECH_SEED', 'MOVE_SPIKES'],
    },
  ],
  opponent: [
    {
      species: 'SPECIES_SNIVY',
      gender: 'female',
      nature: 'NATURE_BOLD',
      ability: 'ABILITY_OVERGROW',
      item: 'ITEM_MIRACLE_SEED',
      moves: ['MOVE_TACKLE', 'MOVE_LEER', 'MOVE_VINE_WHIP', 'MOVE_LEAF_STORM'],
    },
    {
      species: 'SPECIES_EXCADRILL',
      gender: 'male',
      nature: 'NATURE_ADAMANT',
      ability: 'ABILITY_SAND_RUSH',
      item: 'ITEM_FOCUS_SASH',
      moves: ['MOVE_EARTHQUAKE', 'MOVE_ROCK_SLIDE', 'MOVE_RAPID_SPIN', 'MOVE_SWORDS_DANCE'],
    },
    {
      species: 'SPECIES_CHANDELURE',
      gender: 'female',
      nature: 'NATURE_MODEST',
      ability: 'ABILITY_FLASH_FIRE',
      item: 'ITEM_CHOICE_SPECS',
      moves: ['MOVE_FLAMETHROWER', 'MOVE_SHADOW_BALL', 'MOVE_ENERGY_BALL', 'MOVE_WILL_O_WISP'],
    },
    {
      species: 'SPECIES_HAXORUS',
      nickname: 'Axel',
      gender: 'male',
      nature: 'NATURE_JOLLY',
      ability: 'ABILITY_MOLD_BREAKER',
      item: 'ITEM_DRAGON_FANG',
      moves: ['MOVE_DRAGON_DANCE', 'MOVE_OUTRAGE', 'MOVE_EARTHQUAKE', 'MOVE_DRAGON_CLAW'],
    },
    {
      species: 'SPECIES_VOLCARONA',
      gender: 'female',
      nature: 'NATURE_TIMID',
      ability: 'ABILITY_FLAME_BODY',
      item: 'ITEM_SILVER_POWDER',
      moves: ['MOVE_QUIVER_DANCE', 'MOVE_FIRE_BLAST', 'MOVE_BUG_BUZZ', 'MOVE_GIGA_DRAIN'],
    },
    {
      species: 'SPECIES_BISHARP',
      gender: 'male',
      nature: 'NATURE_ADAMANT',
      ability: 'ABILITY_DEFIANT',
      item: 'ITEM_BLACK_GLASSES',
      moves: ['MOVE_NIGHT_SLASH', 'MOVE_IRON_HEAD', 'MOVE_SUCKER_PUNCH', 'MOVE_SWORDS_DANCE'],
    },
  ],
}

const LEVEL = 50
/** Every IV at its top, as @pkmn counts it; the IV members hold it in their five bits. */
const FULL_IV = 31
/** The friendship most species start with. */
const FRIENDSHIP = 70

type GenerationsDex = ConstructorParameters<typeof Generations>[0]
const gen5 = new Generations(Dex as GenerationsDex).get(5)

const byNumber = <T extends { num: number }>(all: Iterable<T>) => {
  const found = new Map<number, T>()
  for (const one of all) if (!found.has(one.num)) found.set(one.num, one)
  return found
}
let species: Map<number, Specie> | undefined
let moves: Map<number, Move> | undefined

/** @pkmn's Gen 5 species of the game's number, in its base form. */
export const dexSpecies = (num: number): Specie | undefined =>
  (species ??= byNumber([...gen5.species].filter((one) => !one.forme))).get(num)

const dexMove = (num: number): Move | undefined => (moves ??= byNumber(gen5.moves)).get(num)

type ListName = 'species' | 'moves' | 'items' | 'abilities' | 'natures'

const namesOf = (mon: TeamMon): [ListName, string][] => [
  ['species', mon.species],
  ['natures', mon.nature],
  ['abilities', mon.ability],
  ['items', mon.item],
  ...mon.moves.map((move): [ListName, string] => ['moves', move]),
]

/** The team's names that the lists of `pkm` lack. */
export function unresolved(pkm: PkmNumbers, team: Team = TEAM): string[] {
  const names = SIDES.flatMap((side) => team[side].flatMap(namesOf))
  return names.filter(([list, name]) => pkm[list][name] === undefined).map(([, name]) => name)
}

function numberOf(pkm: PkmNumbers, list: ListName, name: string): number {
  const found = pkm[list][name]
  if (found === undefined) throw new Error(`the Pokémon format has no ${name}`)
  return found
}

function need<T>(found: T | undefined, what: string): T {
  if (found === undefined) throw new Error(`@pkmn/data knows no Gen 5 ${what}`)
  return found
}

/** One Pokémon of the team as the encoder takes it; `salt` sets its PID apart in its party. */
function writtenOf(mon: TeamMon, ot: WrittenPkm['ot'], salt: number, pkm: PkmNumbers): WrittenPkm {
  const number = numberOf(pkm, 'species', mon.species)
  const dex = need(dexSpecies(number), `species by the number of ${mon.species}`)
  const nature = need(gen5.natures.get(mon.nature.replace(/^NATURE_/, '')), mon.nature)
  const stat = (key: StatID) => gen5.stats.calc(key, dex.baseStats[key], FULL_IV, 0, LEVEL, nature)
  const maxHp = stat('hp')
  return {
    species: number,
    form: 0,
    level: LEVEL,
    exp: 0,
    gender: mon.gender,
    shiny: false,
    nature: numberOf(pkm, 'natures', mon.nature),
    ability: numberOf(pkm, 'abilities', mon.ability),
    item: numberOf(pkm, 'items', mon.item),
    friendship: FRIENDSHIP,
    moves: mon.moves.map((name) => {
      const move = numberOf(pkm, 'moves', name)
      return { move, pp: need(dexMove(move), `move by the number of ${name}`).pp, ppUps: 0 }
    }),
    ivs: { hp: FULL_IV, atk: FULL_IV, def: FULL_IV, spe: FULL_IV, spa: FULL_IV, spd: FULL_IV },
    name: mon.nickname ?? dex.name,
    nicknamed: mon.nickname !== undefined,
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

/** The team as the park takes it: each side's Pokémon as written and sealed, with the side's name
 * as their original trainer (id 0 and gender 0, as PlayerInfo holds them with no save), and a log
 * line per name cut to its room, which names the slot. */
export function teamParties(format: PkmFormat, names: ParkNames, team: Team = TEAM) {
  const parties = { player: [] as Uint8Array[], opponent: [] as Uint8Array[] }
  const written = { player: [] as WrittenPkm[], opponent: [] as WrittenPkm[] }
  const notes: string[] = []
  for (const side of SIDES) {
    const ot = { name: names[side], id: 0, gender: 0 }
    team[side].forEach((mon, i) => {
      const one = writtenOf(mon, ot, i, format.pkm)
      const { bytes, cuts } = plainPkm(one, format)
      written[side].push(one)
      parties[side].push(sealPkm(bytes, format.pkm))
      notes.push(...cuts.map((cut) => `${side}.party.pkms[${String(i)}] ${cut}`))
    })
  }
  const sides: PartySides = parties
  return { parties: sides, written, notes }
}
