import { describe, expect, it } from 'vitest'

import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import { scriptOf } from '../../script/testing.ts'
import type { TeamMember } from '../../script/types.ts'
import { revealedSets } from './revealed.ts'

// Hand-made events on two teams of two: Ferrothorn and Gardevoir near, Starmie and Ditto far.
const member = (species: string): TeamMember => ({
  species,
  name: species,
  level: 100,
  shiny: false,
})
const TEAMS: BattleScript['teams'] = {
  near: [member('Ferrothorn'), member('Gardevoir')],
  far: [member('Starmie'), member('Ditto')],
}
const FERROTHORN = { side: 'near', index: 0 } as const
const GARDEVOIR = { side: 'near', index: 1 } as const
const STARMIE = { side: 'far', index: 0 } as const
const DITTO = { side: 'far', index: 1 } as const

const ability = (name: string) => ({ name, kind: 'ability' }) as const
const item = (name: string) => ({ name, kind: 'item' }) as const
const move = (name: string) => ({ name, kind: 'move' }) as const
const HP = { hp: 90, max: 100 }

const revealed = (...events: ScriptEvent[]) => revealedSets({ teams: TEAMS, events })

describe('the abilities the log reveals', () => {
  // Scene: Starmie hits Ferrothorn and takes Iron Barbs' damage, which names the holder by [of].
  it('credits a damage line’s ability and item to the Pokémon of [of]', () => {
    const { sets } = revealed(
      {
        kind: 'damage',
        line: 1,
        who: STARMIE,
        hp: HP,
        cause: ability('Iron Barbs'),
        source: FERROTHORN,
      },
      {
        kind: 'damage',
        line: 2,
        who: STARMIE,
        hp: HP,
        cause: item('Rocky Helmet'),
        source: FERROTHORN,
      },
      { kind: 'damage', line: 3, who: GARDEVOIR, hp: HP, cause: item('Life Orb') },
    )
    expect(sets.near[0]).toEqual({ moves: [], item: 'Rocky Helmet', ability: 'Iron Barbs' })
    expect(sets.near[1]).toEqual({ moves: [], item: 'Life Orb' })
    expect(sets.far[0]).toEqual({ moves: [] })
  })

  // Scene: Water Absorb heals its holder; the heal's [of] names the attacker.
  it('credits a heal’s ability and item to the Pokémon healed', () => {
    const { sets } = revealed(
      {
        kind: 'heal',
        line: 1,
        who: STARMIE,
        hp: HP,
        cause: ability('Water Absorb'),
        source: GARDEVOIR,
      },
      { kind: 'heal', line: 2, who: STARMIE, hp: HP, cause: item('Shell Bell'), source: GARDEVOIR },
    )
    expect(sets.far[0]).toEqual({ moves: [], item: 'Shell Bell', ability: 'Water Absorb' })
    expect(sets.near[1]).toEqual({ moves: [] })
  })

  // Scene: Gardevoir traces Starmie's Natural Cure; later Natural Cure shows on Gardevoir.
  it('gives Trace to the tracer and the traced ability to its target', () => {
    const { sets } = revealed(
      {
        kind: 'ability',
        line: 1,
        who: GARDEVOIR,
        ability: 'Natural Cure',
        cause: ability('Trace'),
        source: STARMIE,
      },
      { kind: 'ability', line: 2, who: GARDEVOIR, ability: 'Natural Cure' },
    )
    expect(sets.near[1]).toEqual({ moves: [], ability: 'Trace' })
    expect(sets.far[0]).toEqual({ moves: [], ability: 'Natural Cure' })
  })

  // Scene: Role Play copies an ability over, so neither Pokémon shows its own after it.
  it('freezes both abilities when a move changes one', () => {
    const { sets } = revealed(
      {
        kind: 'ability',
        line: 1,
        who: GARDEVOIR,
        ability: 'Iron Barbs',
        cause: move('Role Play'),
        source: FERROTHORN,
      },
      { kind: 'ability', line: 2, who: GARDEVOIR, ability: 'Iron Barbs' },
      {
        kind: 'damage',
        line: 3,
        who: STARMIE,
        hp: HP,
        cause: ability('Iron Barbs'),
        source: FERROTHORN,
      },
      { kind: 'move', line: 4, user: STARMIE, move: 'Skill Swap', target: GARDEVOIR },
      { kind: 'ability', line: 5, who: STARMIE, ability: 'Natural Cure' },
    )
    expect(sets.near).toEqual([{ moves: [] }, { moves: [] }])
    expect(sets.far[0]).toEqual({ moves: ['Skill Swap'] })
  })
})

describe('the abilities a Pokémon shows on its own line', () => {
  // Scene: Tyranitar's Sticky Hold keeps its item; the script reads the line as a block.
  it('reads Sticky Hold’s line as its holder’s ability', () => {
    const { sets } = revealedSets(scriptOf('|-activate|p2a: Tyranitar|ability: Sticky Hold'))
    expect(sets.far[0]).toEqual({ moves: [], ability: 'Sticky Hold' })
  })

  // Scene: a Fire move powers up Tyranitar's Flash Fire.
  it('reads Flash Fire’s start as its holder’s ability', () => {
    const { sets } = revealedSets(scriptOf('|-start|p2a: Tyranitar|ability: Flash Fire'))
    expect(sets.far[0]).toEqual({ moves: [], ability: 'Flash Fire' })
  })

  // Scene: Starmie touches Gardevoir's Mummy and takes it on; later Starmie's Mummy shows.
  it('reads Mummy as its holder’s and freezes the ability of the Pokémon of [of]', () => {
    const { sets } = revealed(
      {
        kind: 'effectActivate',
        line: 1,
        who: GARDEVOIR,
        effect: ability('Mummy'),
        source: STARMIE,
      },
      { kind: 'ability', line: 2, who: STARMIE, ability: 'Mummy' },
    )
    expect(sets.near[1]).toEqual({ moves: [], ability: 'Mummy' })
    expect(sets.far[0]).toEqual({ moves: [] })
  })
})

describe('the items the log reveals', () => {
  // Scene: Starmie tricks its Choice Scarf onto Ferrothorn; each one shows the other's item.
  it('freezes both items on Trick', () => {
    const { sets } = revealed(
      { kind: 'item', line: 1, who: FERROTHORN, item: 'Choice Scarf', cause: move('Trick') },
      { kind: 'item', line: 2, who: STARMIE, item: 'Leftovers', cause: move('Trick') },
      { kind: 'heal', line: 3, who: STARMIE, hp: HP, cause: item('Leftovers') },
    )
    expect(sets.near[0]).toEqual({ moves: [] })
    expect(sets.far[0]).toEqual({ moves: [] })
  })

  // Scene: Thief shows the target's item as it leaves, then the thief's new item.
  it('keeps what an item that ends shows, and freezes the thief’s', () => {
    const { sets } = revealed(
      {
        kind: 'itemEnd',
        line: 1,
        who: STARMIE,
        item: 'Air Balloon',
        cause: move('Thief'),
        source: GARDEVOIR,
      },
      {
        kind: 'item',
        line: 2,
        who: GARDEVOIR,
        item: 'Air Balloon',
        cause: move('Thief'),
        source: STARMIE,
      },
    )
    expect(sets.far[0]).toEqual({ moves: [], item: 'Air Balloon' })
    expect(sets.near[1]).toEqual({ moves: [] })
  })

  // Scene: Air Balloon shows on its own; Frisk names the frisker by [of]; Pickup finds an item.
  it('reads an item shown, by Frisk, and by an item’s activation', () => {
    const { sets } = revealed(
      { kind: 'item', line: 1, who: STARMIE, item: 'Air Balloon' },
      {
        kind: 'item',
        line: 2,
        who: FERROTHORN,
        item: 'Leftovers',
        cause: ability('Frisk'),
        source: GARDEVOIR,
      },
      { kind: 'item', line: 3, who: DITTO, item: 'Sitrus Berry', cause: ability('Pickup') },
      { kind: 'effectActivate', line: 4, who: DITTO, effect: item('Custap Berry') },
      { kind: 'effectActivate', line: 5, effect: item('Custap Berry') },
      { kind: 'itemEnd', line: 6, who: GARDEVOIR, item: 'Custap Berry', eaten: true },
      { kind: 'effectActivate', line: 7, who: GARDEVOIR, effect: move('Protect') },
    )
    expect(sets.far).toEqual([
      { moves: [], item: 'Air Balloon' },
      { moves: [], ability: 'Pickup' },
    ])
    expect(sets.near).toEqual([
      { moves: [], item: 'Leftovers' },
      { moves: [], item: 'Custap Berry', ability: 'Frisk' },
    ])
  })
  // Scene: Tyranitar's Pickpocket takes Dugtrio's Leftovers on contact, as Showdown writes it.
  it('freezes both items on Pickpocket and gives the ability to the thief', () => {
    const { sets } = revealedSets(
      scriptOf(
        '|-enditem|p1a: Dugtrio|Leftovers|[silent]|[from] ability: Pickpocket|[of] p1a: Dugtrio',
        '|-item|p2a: Tyranitar|Leftovers|[from] ability: Pickpocket|[of] p1a: Dugtrio',
      ),
    )
    expect(sets.far[0]).toEqual({ moves: [], ability: 'Pickpocket' })
    expect(sets.near[0]).toEqual({ moves: [], item: 'Leftovers' })
  })
})

describe('the moves the log reveals', () => {
  // Scene: Ditto transforms into Starmie and uses Starmie's moves until it switches out.
  it('skips the moves a Pokémon uses as a transformed copy until its next switch-in', () => {
    const { sets } = revealed(
      { kind: 'transform', line: 1, who: DITTO, into: STARMIE },
      { kind: 'move', line: 2, user: DITTO, move: 'Surf', target: STARMIE },
      { kind: 'switchIn', line: 3, who: DITTO, dragged: false, hp: HP },
      { kind: 'move', line: 4, user: DITTO, move: 'Transform', target: STARMIE },
      { kind: 'move', line: 5, user: STARMIE, move: 'Surf', target: DITTO },
    )
    expect(sets.far).toEqual([{ moves: ['Surf'] }, { moves: ['Transform'] }])
  })

  // Scene: Metronome calls Surf, and Struggle follows; neither is Gardevoir's own move.
  it('skips a called move and Struggle, and counts a move that cannot be used', () => {
    const { sets } = revealed(
      { kind: 'move', line: 1, user: GARDEVOIR, move: 'Metronome' },
      { kind: 'move', line: 2, user: GARDEVOIR, move: 'Surf', calledBy: move('Metronome') },
      { kind: 'move', line: 3, user: GARDEVOIR, move: 'Struggle', target: STARMIE },
      { kind: 'cant', line: 4, who: GARDEVOIR, reason: move('Taunt'), move: 'Calm Mind' },
      { kind: 'cant', line: 5, who: GARDEVOIR, reason: { name: 'par' } },
    )
    expect(sets.near[1]).toEqual({ moves: ['Metronome', 'Calm Mind'] })
  })

  // Scene: a long battle shows a fifth move; the game holds four.
  it('keeps the first four distinct moves and lists each later one as a fallback', () => {
    const moves = [
      'Leech Seed',
      'Spikes',
      'Leech Seed',
      'Power Whip',
      'Gyro Ball',
      'Protect',
      'Curse',
    ]
    const { sets, fallbacks } = revealed(
      ...moves.map((name, line): ScriptEvent => ({
        kind: 'move',
        line,
        user: FERROTHORN,
        move: name,
      })),
    )
    expect(sets.near[0]?.moves).toEqual(['Leech Seed', 'Spikes', 'Power Whip', 'Gyro Ball'])
    expect(fallbacks).toEqual([
      {
        line: 5,
        kind: 'moves',
        detail: 'the near side’s Ferrothorn uses Protect, a move past the four the game holds',
      },
      {
        line: 6,
        kind: 'moves',
        detail: 'the near side’s Ferrothorn uses Curse, a move past the four the game holds',
      },
    ])
  })
})
