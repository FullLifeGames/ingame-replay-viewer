import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../build'
import { eventsAt, eventsFrom, logOf, NEXT, refIn, scriptOf } from '../testing'

const DUGTRIO = { side: 'near', index: 0 } as const
const TYRANITAR = { side: 'far', index: 0 } as const

const short = buildBattleScript(logOf('smogtours-gen3ou-994052'))

describe('the weather rule', () => {
  it('names the rain that ends', () => {
    expect(eventsAt(short, 224)).toEqual([
      { kind: 'weather', line: 224, weather: 'Rain', phase: 'start' },
    ])
    expect(eventsAt(short, 226)).toEqual([
      { kind: 'weather', line: 226, weather: 'Rain', phase: 'upkeep' },
    ])
    expect(eventsAt(short, 272)).toEqual([
      { kind: 'weather', line: 272, weather: 'Rain', phase: 'end' },
    ])
  })

  it('gives Sand Stream as the cause of the sandstorm, and its upkeep phase upkeep', () => {
    expect(eventsAt(short, 26)).toEqual([
      {
        kind: 'weather',
        line: 26,
        weather: 'Sand',
        phase: 'start',
        cause: { name: 'Sand Stream', kind: 'ability' },
        source: refIn(short, 'far', 'Tyranitar'),
      },
    ])
    expect(eventsAt(short, 40)).toEqual([
      { kind: 'weather', line: 40, weather: 'Sand', phase: 'upkeep' },
    ])
  })

  it('refuses weather that ends when none was active', () => {
    expect(() => scriptOf('|-weather|none')).toThrow(new RegExp(`^line ${String(NEXT)}: `))
  })
})

describe('the side and field rules', () => {
  it('lays Spikes on a side, and Rapid Spin clears them', () => {
    const claydol = refIn(short, 'near', 'Claydol')

    expect(eventsAt(short, 47)).toEqual([
      { kind: 'sideStart', line: 47, side: 'near', condition: { name: 'Spikes' } },
    ])
    expect(eventsAt(short, 237)).toEqual([
      {
        kind: 'sideEnd',
        line: 237,
        side: 'near',
        condition: { name: 'Spikes' },
        cause: { name: 'Rapid Spin', kind: 'move' },
        source: claydol,
      },
    ])
  })

  it('starts Perish Song silently on both sides, then counts it at the upkeep', () => {
    const script = buildBattleScript(logOf('smogtours-gen3ou-994176'))
    const suicune = refIn(script, 'near', 'Suicune')
    const celebi = refIn(script, 'far', 'Celebi')

    expect(eventsFrom(script, 66).slice(0, 3)).toEqual([
      { kind: 'effectStart', line: 66, who: suicune, effect: { name: 'perish3' }, silent: true },
      { kind: 'effectStart', line: 67, who: celebi, effect: { name: 'perish3' }, silent: true },
      { kind: 'fieldActivate', line: 68, effect: { name: 'Perish Song', kind: 'move' } },
    ])
    expect(eventsAt(script, 74)).toEqual([
      { kind: 'effectStart', line: 74, who: celebi, effect: { name: 'perish3' } },
    ])
  })
})

describe('the effect rules of a Pokémon', () => {
  it('starts a Substitute, which takes a hit and then breaks', () => {
    const zapdos = refIn(short, 'near', 'Zapdos')

    expect(eventsAt(short, 58)).toEqual([
      { kind: 'effectStart', line: 58, who: zapdos, effect: { name: 'Substitute' } },
    ])
    expect(eventsAt(short, 71)).toEqual([
      {
        kind: 'effectActivate',
        line: 71,
        who: zapdos,
        effect: { name: 'Substitute' },
        damage: true,
      },
    ])
    expect(eventsAt(short, 89)).toEqual([
      {
        kind: 'effectEnd',
        line: 89,
        who: refIn(short, 'near', 'Dugtrio'),
        effect: { name: 'Substitute' },
      },
    ])
  })

  it('keeps the cause of an effect that ends', () => {
    const script = scriptOf(
      '|-start|p1a: Dugtrio|move: Leech Seed',
      '|-end|p1a: Dugtrio|Leech Seed|[from] move: Rapid Spin|[of] p1a: Dugtrio',
    )

    expect(eventsFrom(script, NEXT)).toEqual([
      {
        kind: 'effectStart',
        line: NEXT,
        who: DUGTRIO,
        effect: { name: 'Leech Seed', kind: 'move' },
      },
      {
        kind: 'effectEnd',
        line: NEXT + 1,
        who: DUGTRIO,
        effect: { name: 'Leech Seed' },
        cause: { name: 'Rapid Spin', kind: 'move' },
        source: DUGTRIO,
      },
    ])
  })

  it('tightens Focus Punch for the turn', () => {
    const script = buildBattleScript(logOf('smogtours-gen3ou-994086'))

    expect(eventsAt(script, 35)).toEqual([
      {
        kind: 'singleTurn',
        line: 35,
        who: refIn(script, 'near', 'Tyranitar'),
        effect: { name: 'Focus Punch', kind: 'move' },
      },
    ])
  })

  it('shows Intimidate with what it did', () => {
    const script = buildBattleScript(logOf('smogtours-gen3ou-994128'))

    expect(eventsAt(script, 27)).toEqual([
      {
        kind: 'ability',
        line: 27,
        who: refIn(script, 'near', 'Stantler'),
        ability: 'Intimidate',
        detail: 'boost',
      },
    ])
  })

  it('shows an ability with no detail', () => {
    expect(eventsAt(scriptOf('|-ability|p2a: Tyranitar|Sand Stream'), NEXT)).toEqual([
      { kind: 'ability', line: NEXT, who: TYRANITAR, ability: 'Sand Stream' },
    ])
  })
})

describe('the item rules', () => {
  it('lets Thief take the item silently, then shows it with its cause and source', () => {
    const script = buildBattleScript(logOf('smogtours-gen3ou-994086'))
    const skySands = refIn(script, 'far', 'Sky Sands')
    const skarmory = refIn(script, 'near', 'Skarmory')
    const thief = { name: 'Thief', kind: 'move' }

    expect(eventsFrom(script, 347).slice(0, 2)).toEqual([
      {
        kind: 'itemEnd',
        line: 347,
        who: skySands,
        item: 'Choice Band',
        cause: thief,
        source: skarmory,
        silent: true,
      },
      {
        kind: 'item',
        line: 348,
        who: skarmory,
        item: 'Choice Band',
        cause: thief,
        source: skySands,
      },
    ])
  })

  it('eats a Lum Berry', () => {
    const script = buildBattleScript(logOf('smogtours-gen3ou-994128'))

    expect(eventsAt(script, 66)).toEqual([
      {
        kind: 'itemEnd',
        line: 66,
        who: refIn(script, 'near', 'Kingdra'),
        item: 'Lum Berry',
        eaten: true,
      },
    ])
  })
})
