import { describe, expect, it } from 'vitest'

import { eventsAt, eventsFrom, NEXT, refIn, replayScript, scriptOf } from '../testing'

// Built once, outside the specs' time limit.
const REPLAY_994052 = replayScript('smogtours-gen3ou-994052')
const REPLAY_994086 = replayScript('smogtours-gen3ou-994086')
const REPLAY_994128 = replayScript('smogtours-gen3ou-994128')
const REPLAY_994141 = replayScript('smogtours-gen3ou-994141')

const DUGTRIO = { side: 'near', index: 0 } as const

describe('the HP rules', () => {
  it('gives Leech Seed damage its cause and source, then a silent heal', () => {
    const script = REPLAY_994086
    const seeder = refIn(script, 'far', 'Beanstalk Park')

    expect(eventsFrom(script, 327).slice(0, 2)).toEqual([
      {
        kind: 'damage',
        line: 327,
        who: refIn(script, 'near', 'Blissey'),
        hp: { hp: 88, max: 100 },
        cause: { name: 'Leech Seed' },
        source: seeder,
      },
      { kind: 'heal', line: 328, who: seeder, hp: { hp: 48, max: 100 }, silent: true },
    ])
  })

  it('keeps the wisher of a Wish', () => {
    const script = REPLAY_994141
    const vaporeon = refIn(script, 'far', 'Vaporeon')

    expect(eventsAt(script, 516)).toEqual([
      {
        kind: 'heal',
        line: 516,
        who: vaporeon,
        hp: { hp: 100, max: 100 },
        status: 'par',
        cause: { name: 'Wish', kind: 'move' },
        wisher: vaporeon,
      },
    ])
  })

  it('refuses a wisher who never appeared', () => {
    expect(() => scriptOf('|-heal|p1a: Dugtrio|100/100|[from] move: Wish|[wisher] Mew')).toThrow(
      new RegExp(`^line ${String(NEXT)}: .*Mew`),
    )
  })

  it('keeps the status a hit leaves on the HP bar', () => {
    const script = scriptOf('|-damage|p1a: Dugtrio|54/100 par')

    expect(eventsAt(script, NEXT)).toEqual([
      { kind: 'damage', line: NEXT, who: DUGTRIO, hp: { hp: 54, max: 100 }, status: 'par' },
    ])
  })

  it('lists a partial trap as unsupported and names it', () => {
    expect(scriptOf('|-damage|p1a: Dugtrio|50/100|[partiallytrapped]').dropped.at(-1)).toEqual({
      line: NEXT,
      text: '|-damage|p1a: Dugtrio|50/100|[partiallytrapped]',
      reason: 'unsupported',
      detail: 'keyword argument [partiallytrapped]',
    })
  })
})

describe('the status rules', () => {
  it('gives Rest as the cause of sleep, then fills the bar silently', () => {
    const script = REPLAY_994052
    const suicune = refIn(script, 'near', 'Suicune')

    expect(eventsFrom(script, 210).slice(0, 2)).toEqual([
      {
        kind: 'status',
        line: 210,
        who: suicune,
        status: 'slp',
        cause: { name: 'Rest', kind: 'move' },
      },
      {
        kind: 'heal',
        line: 211,
        who: suicune,
        hp: { hp: 100, max: 100 },
        status: 'slp',
        silent: true,
      },
    ])
  })

  it('cures Natural Cure silently before the switch', () => {
    const script = REPLAY_994052

    expect(eventsFrom(script, 326).slice(0, 2)).toMatchObject([
      {
        kind: 'cureStatus',
        line: 326,
        who: refIn(script, 'near', 'Blissey'),
        status: 'par',
        cause: { name: 'Natural Cure', kind: 'ability' },
        silent: true,
      },
      { kind: 'switchIn', line: 327 },
    ])
  })

  it("marks a cure that shows the status's own message", () => {
    const script = REPLAY_994128

    expect(eventsAt(script, 67)).toEqual([
      {
        kind: 'cureStatus',
        line: 67,
        who: refIn(script, 'near', 'Kingdra'),
        status: 'brn',
        msg: true,
      },
    ])
  })

  it('cures the team with Aromatherapy', () => {
    const script = REPLAY_994052

    expect(eventsAt(script, 290)).toEqual([
      {
        kind: 'cureTeam',
        line: 290,
        who: refIn(script, 'near', 'Blissey'),
        cause: { name: 'Aromatherapy', kind: 'move' },
      },
    ])
  })
})

describe('the stat change rules', () => {
  it('counts a raise as positive stages', () => {
    const script = REPLAY_994052

    expect(eventsAt(script, 127)).toEqual([
      {
        kind: 'statChange',
        line: 127,
        who: refIn(script, 'far', 'Metagross'),
        stat: 'spe',
        stages: 2,
      },
    ])
  })

  it('counts a drop as negative stages', () => {
    const script = REPLAY_994128

    expect(eventsAt(script, 28)).toEqual([
      {
        kind: 'statChange',
        line: 28,
        who: refIn(script, 'far', 'Tyranitar'),
        stat: 'atk',
        stages: -1,
      },
    ])
  })

  it('keeps the cause of a stat change', () => {
    const script = scriptOf('|-boost|p1a: Dugtrio|atk|1|[from] item: Liechi Berry')

    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'statChange',
        line: NEXT,
        who: DUGTRIO,
        stat: 'atk',
        stages: 1,
        cause: { name: 'Liechi Berry', kind: 'item' },
      },
    ])
  })
})
