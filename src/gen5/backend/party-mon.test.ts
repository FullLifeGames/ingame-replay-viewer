import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import { openPkm } from '../pkm-cipher.ts'
import { readPkm } from '../pkm-fields.ts'
import type { PkmFormat } from '../pkm-members.ts'
import { TEAM_PKM, TERMINATOR } from '../pkm.fixtures.ts'
import { type PartyMon, sealParties, writtenMon } from './party-mon.ts'

// Every number of the format is invented (src/gen5/pkm.fixtures.ts): a nickname holds seven
// characters, and the lists hold the natures and the format's "no item". Species, moves, items and
// abilities take @pkmn's dex numbers, which in Gen 5 the game shares.

const FORMAT: PkmFormat = { pkm: TEAM_PKM, terminator: TERMINATOR }
const OT = { name: 'Ann', id: 0, gender: 0 }

/** Oshawott holding nothing. */
const BARE: PartyMon = {
  species: 'Oshawott',
  name: 'Oshawott',
  nicknamed: false,
  level: 50,
  gender: 'M',
  shiny: false,
  nature: 'Hardy',
  ability: 'Torrent',
  moves: ['Tackle', 'Water Gun'],
}
const OSHAWOTT: PartyMon = { ...BARE, item: 'Oran Berry' }

const readBack = (mons: readonly PartyMon[], hp?: number) => {
  const given = hp === undefined ? {} : { hp }
  const written = mons.map((mon, salt) =>
    writtenMon(mon, { ot: OT, salt, format: FORMAT, ...given }),
  )
  const { parties, notes } = sealParties({ player: written, opponent: [] }, FORMAT)
  const read = parties.player.map((bytes) => readPkm(openPkm(bytes, TEAM_PKM).plain, FORMAT))
  return { written, parties, notes, read }
}

/** The one Pokémon written from `mon`, as it reads back. */
function lone(mon: PartyMon, hp?: number) {
  const [one] = readBack([mon], hp).read
  if (one === undefined) throw new Error('nothing read back')
  return one
}

// Scene: the backend writes a replay's Pokémon at 100 HP, so the near box reads the log's
// percentage as its numbers.
describe('a Pokémon by Showdown names', () => {
  it('reads back with its dex number, its moves with their PP, and HP 100 of 100 when given', () => {
    const mon = lone(OSHAWOTT, 100)
    expect(mon.species).toBe(Dex.species.get('Oshawott').num)
    expect(mon.moves.slice(0, 2)).toEqual([
      { move: Dex.moves.get('Tackle').num, pp: Dex.forGen(5).moves.get('Tackle').pp, ppUps: 0 },
      {
        move: Dex.moves.get('Water Gun').num,
        pp: Dex.forGen(5).moves.get('Water Gun').pp,
        ppUps: 0,
      },
    ])
    expect([mon.hp, mon.maxHp]).toEqual([100, 100])
    expect([mon.item, mon.ability, mon.nature]).toEqual([
      Dex.items.get('Oran Berry').num,
      Dex.abilities.get('Torrent').num,
      TEAM_PKM.natures.NATURE_HARDY,
    ])
    expect([mon.gender, mon.level, mon.form, mon.shiny, mon.nicknamed]).toEqual([
      'male',
      50,
      0,
      false,
      false,
    ])
  })

  it('takes HP and stats from @pkmn at its level with full IVs and no EVs when no HP is given', () => {
    const [mon] = readBack([{ ...OSHAWOTT, level: 30, nature: 'Modest' }]).written
    const gen5 = Dex.forGen(5)
    const base = gen5.species.get('Oshawott').baseStats
    // The Gen 5 formula with IV 31 and no EV: HP is (2 base + 31) level / 100 + level + 10.
    const hp = Math.floor(((2 * base.hp + 31) * 30) / 100) + 30 + 10
    expect([mon?.hp, mon?.maxHp]).toEqual([hp, hp])
    // Modest raises Special Attack by a tenth and lowers Attack by as much.
    const plain = (stat: number) => Math.floor(((2 * stat + 31) * 30) / 100) + 5
    expect(mon?.stats.spa).toBe(Math.floor((plain(base.spa) * 110) / 100))
    expect(mon?.stats.atk).toBe(Math.floor((plain(base.atk) * 90) / 100))
    expect(mon?.ivs).toEqual({ hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 })
  })

  it('writes the format’s "no item" for a Pokémon that holds none', () => {
    expect(lone(BARE).item).toBe(TEAM_PKM.items.ITEM_NONE)
    const noNone = { ...FORMAT, pkm: { ...TEAM_PKM, items: {} } }
    expect(() => writtenMon(BARE, { ot: OT, salt: 0, format: noNone })).toThrow(
      'the list of items has no ITEM_NONE',
    )
  })

  it('writes a genderless Pokémon as one, and a nickname with its flag', () => {
    const rotom = { ...OSHAWOTT, species: 'Rotom', ability: 'Levitate', gender: undefined }
    const named = { ...OSHAWOTT, name: 'Shell', nicknamed: true }
    const [genderless, nicknamed] = readBack([rotom, named]).read
    expect(genderless?.gender).toBe('none')
    expect([nicknamed?.name, nicknamed?.nicknamed]).toEqual(['Shell', true])
  })

  it('fails by name on a species, a move or an item with no Gen 5 entry', () => {
    const write = (mon: PartyMon) => () => writtenMon(mon, { ot: OT, salt: 0, format: FORMAT })
    expect(write({ ...OSHAWOTT, species: 'Sprigatito' })).toThrow('no Gen 5 species Sprigatito')
    expect(write({ ...OSHAWOTT, moves: ['Moonblast'] })).toThrow('no Gen 5 move Moonblast')
    expect(write({ ...OSHAWOTT, item: 'Assault Vest' })).toThrow('no Gen 5 item Assault Vest')
  })
})

// Scene: the park writes both sides' parties as sealed bytes, and the run's log names each name
// that its room cuts.
describe('the parties sealed', () => {
  it('seals each side in its order, apart in their PIDs, and names each cut by side and slot', () => {
    const long = { ...OSHAWOTT, name: 'Shellshocker', nicknamed: true }
    const { parties, notes, read } = readBack([OSHAWOTT, long, OSHAWOTT])
    expect(parties.player).toHaveLength(3)
    expect(parties.opponent).toEqual([])
    expect(parties.player.every((bytes) => openPkm(bytes, TEAM_PKM).checksumRight)).toBe(true)
    expect(new Set(read.map((one) => one.personality)).size).toBe(3)
    // "Oshawott" itself holds one character more than the invented room.
    expect(notes.map((note) => note.split(' ')[0])).toEqual(
      [0, 1, 2].map((i) => `player.party.pkms[${String(i)}]`),
    )
    expect(notes[1]).toBe(
      'player.party.pkms[1] PkmBlockC.nickname: "Shellshocker" cut to "Shellsh", the 7 characters it holds',
    )
  })
})
