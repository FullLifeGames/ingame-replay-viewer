import { describe, expect, it } from 'vitest'

import { eventsAt, eventsFrom, NEXT, refIn, replayScript, scriptOf } from './testing'

// Built once, outside the specs' time limit.
const REPLAY_994052 = replayScript('smogtours-gen3ou-994052')

const DUGTRIO = { side: 'near', index: 0 } as const
const TYRANITAR = { side: 'far', index: 0 } as const

describe('folding a hit', () => {
  it('makes a super effective critical hit one damage event', () => {
    const script = scriptOf(
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-supereffective|p2a: Tyranitar',
      '|-crit|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|0 fnt',
      '|faint|p2a: Tyranitar',
    )

    expect(eventsFrom(script, NEXT + 1)).toEqual([
      {
        kind: 'damage',
        line: NEXT + 3,
        who: TYRANITAR,
        hp: { hp: 0, max: 100 },
        crit: true,
        effectiveness: 'super',
        folded: [NEXT + 1, NEXT + 2],
      },
      { kind: 'faint', line: NEXT + 4, who: TYRANITAR },
    ])
  })

  it('folds the effectiveness of a test replay into its knockout', () => {
    const script = REPLAY_994052

    expect(eventsAt(script, 33)).toEqual([])
    expect(eventsAt(script, 34)).toEqual([
      {
        kind: 'damage',
        line: 34,
        who: refIn(script, 'far', 'Tyranitar'),
        hp: { hp: 0, max: 100 },
        effectiveness: 'super',
        folded: [33],
      },
    ])
  })

  it('folds a critical hit on a Substitute into the Substitute', () => {
    const script = scriptOf(
      '|-start|p2a: Tyranitar|Substitute',
      '|-crit|p2a: Tyranitar',
      '|-activate|p2a: Tyranitar|Substitute|[damage]',
      '|-resisted|p2a: Tyranitar',
      '|-end|p2a: Tyranitar|Substitute',
    )
    const substitute = { name: 'Substitute' }

    expect(eventsFrom(script, NEXT + 1)).toEqual([
      {
        kind: 'effectActivate',
        line: NEXT + 2,
        who: TYRANITAR,
        effect: substitute,
        damage: true,
        crit: true,
        folded: [NEXT + 1],
      },
      {
        kind: 'effectEnd',
        line: NEXT + 4,
        who: TYRANITAR,
        effect: substitute,
        effectiveness: 'resisted',
        folded: [NEXT + 3],
      },
    ])
  })

  it('lets the Endure activation pass while the modifier waits for the damage', () => {
    const script = scriptOf(
      '|-supereffective|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Endure',
      '|-damage|p1a: Dugtrio|1/100',
    )

    expect(eventsFrom(script, NEXT)).toEqual([
      {
        kind: 'effectActivate',
        line: NEXT + 1,
        who: DUGTRIO,
        effect: { name: 'Endure', kind: 'move' },
      },
      {
        kind: 'damage',
        line: NEXT + 2,
        who: DUGTRIO,
        hp: { hp: 1, max: 100 },
        effectiveness: 'super',
        folded: [NEXT],
      },
    ])
  })
})

describe('a modifier that no hit takes', () => {
  it('stays its own event when the turn ends first', () => {
    const script = scriptOf('|-crit|p2a: Tyranitar', '|turn|2')

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'crit', line: NEXT, who: TYRANITAR },
      { kind: 'turn', line: NEXT + 1, number: 2 },
    ])
  })

  it('stays its own event at the end of the log', () => {
    expect(eventsFrom(scriptOf('|-resisted|p2a: Tyranitar'), NEXT)).toEqual([
      { kind: 'effectiveness', line: NEXT, who: TYRANITAR, effectiveness: 'resisted' },
    ])
  })

  it('skips damage with a cause and damage to another Pokémon', () => {
    const script = scriptOf(
      '|-crit|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|94/100|[from] Sandstorm',
      '|-damage|p1a: Dugtrio|50/100',
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
    )

    expect(eventsFrom(script, NEXT).map(({ kind, line }) => [kind, line])).toEqual([
      ['crit', NEXT],
      ['damage', NEXT + 1],
      ['damage', NEXT + 2],
      ['move', NEXT + 3],
    ])
  })

  it('leaves an effect ending that is no Substitute alone', () => {
    const script = scriptOf('|-supereffective|p2a: Tyranitar', '|-end|p2a: Tyranitar|Leech Seed')

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'effectiveness', line: NEXT, who: TYRANITAR, effectiveness: 'super' },
      { kind: 'effectEnd', line: NEXT + 1, who: TYRANITAR, effect: { name: 'Leech Seed' } },
    ])
  })
})
