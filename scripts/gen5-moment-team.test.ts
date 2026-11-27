import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import { openPkm } from '../src/gen5/pkm-cipher'
import { readPkm } from '../src/gen5/pkm-fields'
import { type PkmFormat, pkmFormat } from '../src/gen5/pkm-members'
import { TEAM_PKM, TERMINATOR } from '../src/gen5/pkm.fixtures'
import { replayTeam } from './gen5-moment-replay'
import { momentTeam, TEAM, type Team, teamParties } from './gen5-moment-team'
import { REPLAY_NUMBERS as NUMBERS } from '../src/gen5/backend/replay.fixtures'

// Every number of the format is invented (src/gen5/pkm.fixtures.ts): a nickname holds seven
// characters, and the lists hold the team's natures. Species, moves, items and abilities take
// @pkmn's dex numbers, which in Gen 5 the game shares.

const FORMAT: PkmFormat = { pkm: TEAM_PKM, terminator: TERMINATOR }
const NAMES = { player: 'Ann', opponent: 'Bo' }
const SIDES = ['player', 'opponent'] as const

/** The team with its far lead's entry changed. */
const withFarLead = (change: Partial<Team['opponent'][number]>): Team => {
  const [lead, ...rest] = TEAM.opponent
  if (lead === undefined) throw new Error('no far lead')
  return { ...TEAM, opponent: [{ ...lead, ...change }, ...rest] }
}

// Scene: a run without a save writes six Pokémon a side, named by Showdown's names, as the
// battle's party copies take them.
describe('the moment team', () => {
  it('names the same twelve Pokémon by Showdown’s names', () => {
    expect(TEAM.player.map((mon) => mon.species)).toEqual([
      'Oshawott',
      'Pikachu',
      'Rotom',
      'Lucario',
      'Gyarados',
      'Ferrothorn',
    ])
    expect(TEAM.opponent.map((mon) => mon.species)).toEqual([
      'Snivy',
      'Excadrill',
      'Chandelure',
      'Haxorus',
      'Volcarona',
      'Bisharp',
    ])
    expect(TEAM.player[0]).toMatchObject({
      nature: 'Modest',
      ability: 'Torrent',
      item: 'Oran Berry',
      moves: ['Tackle', 'Water Gun', 'Tail Whip', 'Hydro Pump'],
    })
  })

  it('fails by name on a species, a move or an item with no Gen 5 entry', () => {
    const parties = (team: Team) => () => teamParties(FORMAT, NAMES, team)
    expect(parties(withFarLead({ species: 'Sprigatito' }))).toThrow('no Gen 5 species Sprigatito')
    expect(parties(withFarLead({ moves: ['Tackle', 'Moonblast'] }))).toThrow(
      'no Gen 5 move Moonblast',
    )
    expect(parties(withFarLead({ item: 'Assault Vest' }))).toThrow('no Gen 5 item Assault Vest')
  })

  it('leads with two Pokémon other than the save’s Tepig that both know Tackle', () => {
    const leads = SIDES.map((side) => TEAM[side][0])
    expect(leads.map((lead) => lead?.species)).not.toContain('Tepig')
    expect(leads.every((lead) => lead?.moves.includes('Tackle'))).toBe(true)
  })

  it('seals six a side, each opening with a right checksum to the species and moves written', () => {
    const { parties, written } = teamParties(FORMAT, NAMES)
    for (const side of SIDES) {
      expect(parties[side]).toHaveLength(6)
      const opened = parties[side].map((bytes) => openPkm(bytes, TEAM_PKM))
      expect(opened.every((one) => one.checksumRight)).toBe(true)
      const read = opened.map((one) => readPkm(one.plain, FORMAT))
      expect(read.map((one) => one.species)).toEqual(
        TEAM[side].map((mon) => Dex.species.get(mon.species).num),
      )
      expect(read.map((one) => one.moves.map((slot) => slot.move))).toEqual(
        TEAM[side].map((mon) => mon.moves.map((move) => Dex.moves.get(move).num)),
      )
      expect(new Set(read.map((one) => one.personality)).size).toBe(6)
      expect(read.some((one) => one.shiny)).toBe(false)
      expect(read.map((one) => one.ot.name)).toEqual(Array(6).fill(NAMES[side]))
      const kept = written[side].map((one) => [one.form, one.exp, one.level, one.hp === one.maxHp])
      expect(kept).toEqual(Array(6).fill([0, 0, 50, true]))
    }
  })

  it('keeps the HP that @pkmn calculates', () => {
    const [lead] = teamParties(FORMAT, NAMES).written.player
    const species = Dex.forGen(5).species.get('Oshawott')
    // The Gen 5 formula at level 50 with full IVs and no EVs: base + 75 for HP.
    expect(lead?.maxHp).toBe(species.baseStats.hp + 75)
  })

  it('cuts the long nickname to its room and keeps the short one', () => {
    const { notes, written } = teamParties(FORMAT, NAMES)
    expect(notes).toContain(
      'player.party.pkms[0] PkmBlockC.nickname: "Shellshocker" cut to "Shellsh", the 7 characters it holds',
    )
    expect(notes.filter((note) => note.includes('"Axel"'))).toEqual([])
    expect(written.opponent.find((one) => one.nicknamed)?.name).toBe('Axel')
  })
})

// Scene: the run writes the hand team with the names given, or a test replay's teams and names.
describe('momentTeam', () => {
  it('gives the hand team with the names given and no fallback', async () => {
    const team = await momentTeam({ from: 'hand', names: NAMES }, NUMBERS)
    expect(team).toEqual({ ...teamParties(pkmFormat(NUMBERS), NAMES), names: NAMES, fallbacks: [] })
  })

  it('loads a test replay’s teams and names through the module runner', async () => {
    const team = await momentTeam({ from: 'replay', id: 'gen5ou-2718717830' }, NUMBERS)
    expect(team).toEqual(replayTeam('gen5ou-2718717830', NUMBERS))
  })
})
