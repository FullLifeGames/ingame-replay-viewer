import { describe, expect, it } from 'vitest'

import type { BattleScript } from '../../script/events.ts'
import { replayScript } from '../../script/testing.ts'
import { ENTRY } from '../direct-entry.fixtures.ts'
import { TEAM_PKM } from '../pkm.fixtures.ts'
import { nameOfNumber } from './names.ts'
import { buildGen5Replay, GEN5_REPLAY_VERSION, type ReplayNumbers } from './replay.ts'

// The invented numbers of these specs: the Pokémon format and the entry of src/gen5's fixtures, a
// font of printable ASCII, and a made-up pin.
const NUMBERS: ReplayNumbers = {
  pkm: TEAM_PKM,
  entry: ENTRY,
  font: { chars: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') },
  pokebw2: { repository: 'https://example.invalid/pokebw2.git', commit: 'c0ffee' },
}

// Built once, outside the specs' time limit.
const SUN_RAIN = replayScript('gen5ou-2718717830')
const SAND = replayScript('smogtours-gen5ou-862240')

// Scene: the run takes a test replay's trainers and teams into Black 2's battle at its start.
describe('a Gen 5 replay from a battle script', () => {
  it('carries its version, the pin, the trainers and the dropped lines', () => {
    const replay = buildGen5Replay(SUN_RAIN, NUMBERS)
    expect(replay.version).toBe(GEN5_REPLAY_VERSION)
    expect(replay.pin).toBe('c0ffee')
    expect(replay.trainers).toEqual({ player: 'isolatedstar', opponent: 'abc2158' })
    expect(replay.blocks).toEqual([])
    expect(replay.dropped).toBe(SUN_RAIN.dropped)
  })

  it('writes twelve species by number, each at HP 100 of 100, its trainer as the OT', () => {
    const { parties } = buildGen5Replay(SUN_RAIN, NUMBERS)
    const named = (side: 'player' | 'opponent') =>
      parties[side].map((mon) => nameOfNumber('species', mon.species))
    expect(named('player')).toEqual([
      'Politoed',
      'Ferrothorn',
      'Keldeo',
      'Scizor',
      'Thundurus',
      'Tentacruel',
    ])
    expect(named('opponent')).toEqual([
      'Darmanitan',
      'Blissey',
      'Ninetales',
      'Starmie',
      'Volcarona',
      'Ferrothorn',
    ])
    const all = [...parties.player, ...parties.opponent]
    expect(all.every((mon) => mon.hp === 100 && mon.maxHp === 100)).toBe(true)
    expect(all.every((mon) => mon.form === 0)).toBe(true)
    expect(new Set(parties.player.map((mon) => mon.ot.name))).toEqual(new Set(['isolatedstar']))
    expect(new Set(parties.opponent.map((mon) => mon.ot.name))).toEqual(new Set(['abc2158']))
  })

  it('names each item and ability the log reveals by number', () => {
    const { parties } = buildGen5Replay(SUN_RAIN, NUMBERS)
    const [ninetales, ferrothorn] = [parties.opponent[2], parties.opponent[5]]
    expect(nameOfNumber('item', ninetales?.item ?? 0)).toBe('Leftovers')
    expect(nameOfNumber('ability', ninetales?.ability ?? 0)).toBe('Drought')
    expect(nameOfNumber('ability', ferrothorn?.ability ?? 0)).toBe('Iron Barbs')
    expect(ferrothorn?.item).toBe(TEAM_PKM.items.ITEM_NONE)
  })

  it('lists each forme as a fallback in line order', () => {
    const forms = (script: BattleScript) =>
      buildGen5Replay(script, NUMBERS).fallbacks.filter((one) => one.kind === 'form')
    expect(forms(SUN_RAIN).map((one) => one.detail)).toEqual([
      'Thundurus-Therian shows in the base form of Thundurus',
    ])
    const sand = forms(SAND)
    expect(sand.map((one) => one.detail)).toEqual([
      'Landorus-Therian shows in the base form of Landorus',
      'Landorus-Therian shows in the base form of Landorus',
    ])
    expect(sand.map((one) => one.line)).toEqual(
      [...sand.map((one) => one.line)].sort((a, b) => a - b),
    )
  })

  // Scene: a trainer's name holds a character the font lacks.
  it('puts "?" for a character of a trainer’s name the font lacks and lists it', () => {
    const events = SAND.events.map((event) =>
      event.kind === 'player' && event.side === 'far' ? { ...event, name: 'Monaï' } : event,
    )
    const replay = buildGen5Replay({ ...SAND, events }, NUMBERS)
    expect(replay.trainers).toEqual({ player: 'tizio potente ao', opponent: 'Mona?' })
    expect(replay.parties.opponent[0]?.ot.name).toBe('Mona?')
    expect(replay.fallbacks.filter((one) => one.kind === 'character')).toEqual([
      { line: 4, kind: 'character', detail: 'the far trainer’s name "Monaï" shows "?" for "ï"' },
    ])
  })

  it('fails by name on a species Gen 5 lacks and on a side with no player', () => {
    const [first, ...rest] = SUN_RAIN.teams.near
    const xerneas = { ...SUN_RAIN.teams, near: [{ ...first, species: 'Xerneas' }, ...rest] }
    expect(() => buildGen5Replay({ ...SUN_RAIN, teams: xerneas } as BattleScript, NUMBERS)).toThrow(
      'no Gen 5 species Xerneas',
    )
    const events = SUN_RAIN.events.filter(
      (event) => event.kind !== 'player' || event.side !== 'far',
    )
    expect(() => buildGen5Replay({ ...SUN_RAIN, events }, NUMBERS)).toThrow(
      'the log names no player on the far side',
    )
  })
})
