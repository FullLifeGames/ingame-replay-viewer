// The team of the moment script's direct start (#97, plan E-6, decision 6): six Pokémon a side,
// named by Showdown's names, as the park writes them into both parties of a run with or without a
// save. They go through the backend's one way from names to a written Pokémon
// (src/gen5/backend/party-mon.ts) at level 50, with the HP that @pkmn calculates. No shiny, no
// status, no Illusion or Transform user. Both leads know Tackle for the scene "known", and neither
// is the save's Tepig. With --replay the run writes a test replay's teams instead
// (gen5-moment-replay.ts, #106), which this module loads through Vite's module runner.
import { join } from 'node:path'

import { runnerImport } from 'vite'

import { type PartyMon, sealParties, trainerOt, writtenMon } from '../src/gen5/backend/party-mon.ts'
import type { ReplayNumbers } from '../src/gen5/backend/replay.ts'
import type { ParkNames } from '../src/gen5/direct-park.ts'
import { type PkmFormat, pkmFormat } from '../src/gen5/pkm-members.ts'
import type { MomentTeam } from './gen5-moment-args.ts'
import type * as MomentReplay from './gen5-moment-replay.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** A Pokémon of the team by Showdown's names; with no nickname it shows its species' name. */
export type TeamMon = Omit<PartyMon, 'name' | 'nicknamed' | 'level' | 'shiny'> & {
  nickname?: string
}

type TeamSide = keyof ParkNames
export type Team = Record<TeamSide, readonly TeamMon[]>

/** The team: what each one exercises is in the lane's ledger (step E-6d). */
export const TEAM: Team = {
  player: [
    {
      species: 'Oshawott',
      nickname: 'Shellshocker',
      gender: 'M',
      nature: 'Modest',
      ability: 'Torrent',
      item: 'Oran Berry',
      moves: ['Tackle', 'Water Gun', 'Tail Whip', 'Hydro Pump'],
    },
    {
      species: 'Pikachu',
      gender: 'F',
      nature: 'Timid',
      ability: 'Static',
      item: 'Light Ball',
      moves: ['Thunderbolt', 'Quick Attack', 'Iron Tail', 'Volt Tackle'],
    },
    {
      species: 'Rotom',
      nature: 'Calm',
      ability: 'Levitate',
      item: 'Leftovers',
      moves: ['Thunderbolt', 'Shadow Ball', 'Thunder Wave', 'Hex'],
    },
    {
      species: 'Lucario',
      gender: 'M',
      nature: 'Jolly',
      ability: 'Steadfast',
      item: 'Life Orb',
      moves: ['Aura Sphere', 'Close Combat', 'Extreme Speed', 'Swords Dance'],
    },
    {
      species: 'Gyarados',
      gender: 'M',
      nature: 'Adamant',
      ability: 'Intimidate',
      item: 'Mystic Water',
      moves: ['Waterfall', 'Dragon Dance', 'Ice Fang', 'Earthquake'],
    },
    {
      species: 'Ferrothorn',
      gender: 'F',
      nature: 'Impish',
      ability: 'Iron Barbs',
      item: 'Rocky Helmet',
      moves: ['Power Whip', 'Gyro Ball', 'Leech Seed', 'Spikes'],
    },
  ],
  opponent: [
    {
      species: 'Snivy',
      gender: 'F',
      nature: 'Bold',
      ability: 'Overgrow',
      item: 'Miracle Seed',
      moves: ['Tackle', 'Leer', 'Vine Whip', 'Leaf Storm'],
    },
    {
      species: 'Excadrill',
      gender: 'M',
      nature: 'Adamant',
      ability: 'Sand Rush',
      item: 'Focus Sash',
      moves: ['Earthquake', 'Rock Slide', 'Rapid Spin', 'Swords Dance'],
    },
    {
      species: 'Chandelure',
      gender: 'F',
      nature: 'Modest',
      ability: 'Flash Fire',
      item: 'Choice Specs',
      moves: ['Flamethrower', 'Shadow Ball', 'Energy Ball', 'Will-O-Wisp'],
    },
    {
      species: 'Haxorus',
      nickname: 'Axel',
      gender: 'M',
      nature: 'Jolly',
      ability: 'Mold Breaker',
      item: 'Dragon Fang',
      moves: ['Dragon Dance', 'Outrage', 'Earthquake', 'Dragon Claw'],
    },
    {
      species: 'Volcarona',
      gender: 'F',
      nature: 'Timid',
      ability: 'Flame Body',
      item: 'Silver Powder',
      moves: ['Quiver Dance', 'Fire Blast', 'Bug Buzz', 'Giga Drain'],
    },
    {
      species: 'Bisharp',
      gender: 'M',
      nature: 'Adamant',
      ability: 'Defiant',
      item: 'Black Glasses',
      moves: ['Night Slash', 'Iron Head', 'Sucker Punch', 'Swords Dance'],
    },
  ],
}

const LEVEL = 50

/** A Pokémon of the team as a party's Pokémon. */
const partyMon = ({ nickname, ...mon }: TeamMon): PartyMon => ({
  ...mon,
  name: nickname ?? mon.species,
  nicknamed: nickname !== undefined,
  level: LEVEL,
  shiny: false,
})

/** The team as the park takes it: each side's Pokémon as written and sealed, with the side's name
 * as their original trainer (`trainerOt`), and a log line per name cut to its room, which names
 * the slot. */
export function teamParties(format: PkmFormat, names: ParkNames, team: Team = TEAM) {
  const side = (of: TeamSide) => {
    const ot = trainerOt(names[of])
    return team[of].map((mon, salt) => writtenMon(partyMon(mon), { ot, salt, format }))
  }
  const written = { player: side('player'), opponent: side('opponent') }
  return { ...sealParties(written, format), written }
}

/** The direct entry's team as the park writes it: the hand team with the names given, which has
 * no fallback, or the test replay's teams and names. src/script/ resolves as the page's bundler
 * does, which plain Node cannot load, so the replay's module goes through Vite's module runner. */
export async function momentTeam(
  team: MomentTeam,
  numbers: ReplayNumbers,
): Promise<MomentReplay.ReplayTeam> {
  if (team.from === 'hand') {
    const hand = teamParties(pkmFormat(numbers), team.names)
    const none = { fallbacks: [], replay: undefined, orders: [], lines: [], end: undefined }
    return { ...hand, names: team.names, ...none }
  }
  const path = join(GEN5_PATHS.repo, 'scripts', 'gen5-moment-replay.ts')
  const { module } = await runnerImport<typeof MomentReplay>(path, {
    configFile: false,
    logLevel: 'silent',
  })
  return module.replayTeam(team, numbers)
}
