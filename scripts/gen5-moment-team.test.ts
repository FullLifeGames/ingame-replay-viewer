import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import { openPkm } from '../src/gen5/pkm-cipher'
import { readPkm } from '../src/gen5/pkm-fields'
import type { PkmFormat } from '../src/gen5/pkm-members'
import { TEAM_PKM, TERMINATOR } from '../src/gen5/pkm.fixtures'
import { TEAM, teamParties, unresolved } from './gen5-moment-team'

// Every number here is invented (src/gen5/pkm.fixtures.ts): a format whose nickname holds seven
// characters and whose lists give each of the team's names a number of its own.

const FORMAT: PkmFormat = { pkm: TEAM_PKM, terminator: TERMINATOR }
const NAMES = { player: 'Ann', opponent: 'Bo' }
const SIDES = ['player', 'opponent'] as const

const without = (list: 'species' | 'moves', name: string): PkmFormat => {
  const rest = Object.fromEntries(Object.entries(TEAM_PKM[list]).filter(([key]) => key !== name))
  return { ...FORMAT, pkm: { ...TEAM_PKM, [list]: rest } }
}

// Scene: a run without a save writes six Pokémon a side, named by pokebw2's constants, as the
// battle's party copies take them.
describe('the moment team', () => {
  it('resolves every name of the team in the lists', () => {
    expect(unresolved(TEAM_PKM)).toEqual([])
    expect(unresolved(without('species', 'SPECIES_SNIVY').pkm)).toEqual(['SPECIES_SNIVY'])
    expect(() => teamParties(without('moves', 'MOVE_LEER'), NAMES)).toThrow(
      'the Pokémon format has no MOVE_LEER',
    )
  })

  it('leads with two Pokémon other than the save’s Tepig that both know Tackle', () => {
    const leads = SIDES.map((side) => TEAM[side][0])
    expect(leads.map((lead) => lead?.species)).not.toContain('SPECIES_TEPIG')
    expect(leads.every((lead) => lead?.moves.includes('MOVE_TACKLE'))).toBe(true)
  })

  it('seals six a side, each opening with a right checksum to the species and moves written', () => {
    const { parties, written } = teamParties(FORMAT, NAMES)
    for (const side of SIDES) {
      expect(parties[side]).toHaveLength(6)
      const opened = parties[side].map((bytes) => openPkm(bytes, TEAM_PKM))
      expect(opened.every((one) => one.checksumRight)).toBe(true)
      const read = opened.map((one) => readPkm(one.plain, FORMAT))
      expect(read.map((one) => one.species)).toEqual(
        TEAM[side].map((mon) => TEAM_PKM.species[mon.species]),
      )
      expect(read.map((one) => one.moves.map((slot) => slot.move))).toEqual(
        TEAM[side].map((mon) => mon.moves.map((move) => TEAM_PKM.moves[move])),
      )
      expect(new Set(read.map((one) => one.personality)).size).toBe(6)
      expect(read.some((one) => one.shiny)).toBe(false)
      expect(read.map((one) => one.ot.name)).toEqual(Array(6).fill(NAMES[side]))
      expect(written[side].map((one) => [one.form, one.exp, one.hp === one.maxHp])).toEqual(
        Array(6).fill([0, 0, true]),
      )
    }
  })

  it('takes PP and stats from @pkmn by the game’s numbers', () => {
    const [lead] = teamParties(FORMAT, NAMES).written.player
    const tackle = Dex.forGen(5)
      .moves.all()
      .find((move) => move.num === TEAM_PKM.moves.MOVE_TACKLE)
    expect(lead?.moves[0]).toEqual({ move: TEAM_PKM.moves.MOVE_TACKLE, pp: tackle?.pp, ppUps: 0 })
    const species = Dex.forGen(5)
      .species.all()
      .find((one) => one.num === TEAM_PKM.species.SPECIES_OSHAWOTT)
    // The Gen 5 formula at level 50 with full IVs and no EVs: base + 75 for HP.
    expect(lead?.maxHp).toBe((species?.baseStats.hp ?? 0) + 75)
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
