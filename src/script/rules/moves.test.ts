import { describe, expect, it } from 'vitest'

import { eventsAt, eventsFrom, NEXT, refIn, replayScript, scriptOf } from '../testing'

// Built once, outside the specs' time limit.
const REPLAY_994052 = replayScript('smogtours-gen3ou-994052')
const REPLAY_994086 = replayScript('smogtours-gen3ou-994086')
const REPLAY_994128 = replayScript('smogtours-gen3ou-994128')

const DUGTRIO = { side: 'near', index: 0 } as const
const TYRANITAR = { side: 'far', index: 0 } as const

describe('the move rules', () => {
  it('keeps the miss flag of a missed move and its miss event', () => {
    const script = REPLAY_994052
    const skarmory = refIn(script, 'far', 'Skarmory')
    const claydol = refIn(script, 'near', 'Claydol')

    expect(eventsFrom(script, 221).slice(0, 2)).toEqual([
      { kind: 'move', line: 221, user: skarmory, move: 'Toxic', target: claydol, miss: true },
      { kind: 'miss', line: 222, user: skarmory, target: claydol },
    ])
  })

  it('names Sleep Talk as the call of the move it picks', () => {
    const script = scriptOf(
      '|move|p1a: Dugtrio|Sleep Talk|p1a: Dugtrio',
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[from]Sleep Talk',
    )

    expect(eventsAt(script, NEXT + 1)).toEqual([
      {
        kind: 'move',
        line: NEXT + 1,
        user: DUGTRIO,
        move: 'Earthquake',
        target: TYRANITAR,
        calledBy: { name: 'Sleep Talk' },
      },
    ])
  })

  it('gives a move without a target, still or notarget, no target', () => {
    const script = scriptOf(
      '|move|p2a: Tyranitar|Protect||[still]',
      '|move|p1a: Dugtrio|Earthquake|null|[notarget]',
    )

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'move', line: NEXT, user: TYRANITAR, move: 'Protect', still: true },
      { kind: 'move', line: NEXT + 1, user: DUGTRIO, move: 'Earthquake', notarget: true },
    ])
  })

  it("makes Protect's activation a block event", () => {
    const script = REPLAY_994086

    expect(eventsAt(script, 62)).toEqual([
      {
        kind: 'block',
        line: 62,
        who: refIn(script, 'far', 'Machine Passage'),
        effect: { name: 'Protect' },
      },
    ])
  })

  it('keeps the move a block stopped and the Pokémon it came from', () => {
    const script = scriptOf('|-block|p2a: Tyranitar|Protect|Earthquake|[of] p1a: Dugtrio')

    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'block',
        line: NEXT,
        who: TYRANITAR,
        effect: { name: 'Protect' },
        move: 'Earthquake',
        source: DUGTRIO,
      },
    ])
  })

  it('gives Clear Body as the cause and source of a failed unboost', () => {
    const script = REPLAY_994128
    const metagross = refIn(script, 'far', 'Metagross')

    expect(eventsAt(script, 152)).toEqual([
      {
        kind: 'fail',
        line: 152,
        who: metagross,
        effect: { name: 'unboost' },
        cause: { name: 'Clear Body', kind: 'ability' },
        source: metagross,
      },
    ])
  })

  it('keeps the stat of a failed unboost, by its id, and a bare failure', () => {
    const script = scriptOf('|-fail|p2a: Tyranitar|unboost|Attack', '|-fail|p1a: Dugtrio')

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'fail', line: NEXT, who: TYRANITAR, effect: { name: 'unboost' }, stat: 'atk' },
      { kind: 'fail', line: NEXT + 1, who: DUGTRIO },
    ])
  })

  // Showdown's Substitute, `onTryHit`: `this.add('-fail', source, 'move: Substitute', '[weak]')`.
  it('keeps a Substitute that fails for too little HP as a weak failure', () => {
    const script = scriptOf('|-fail|p1a: Dugtrio|move: Substitute|[weak]')

    expect(eventsFrom(script, NEXT)).toEqual([
      {
        kind: 'fail',
        line: NEXT,
        who: DUGTRIO,
        effect: { name: 'Substitute', kind: 'move' },
        weak: true,
      },
    ])
    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  it('names the reason a Pokémon cannot move, and the move when the log gives it', () => {
    const script = scriptOf('|cant|p2a: Tyranitar|par', '|cant|p1a: Dugtrio|Disable|Earthquake')

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'cant', line: NEXT, who: TYRANITAR, reason: { name: 'par' } },
      {
        kind: 'cant',
        line: NEXT + 1,
        who: DUGTRIO,
        reason: { name: 'Disable' },
        move: 'Earthquake',
      },
    ])
  })

  it('keeps an immunity and its cause', () => {
    const script = scriptOf(
      '|-immune|p2a: Tyranitar',
      '|-immune|p1a: Dugtrio|[from] ability: Levitate',
      '|-miss|p1a: Dugtrio',
    )

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'immune', line: NEXT, who: TYRANITAR },
      {
        kind: 'immune',
        line: NEXT + 1,
        who: DUGTRIO,
        cause: { name: 'Levitate', kind: 'ability' },
      },
      { kind: 'miss', line: NEXT + 2, user: DUGTRIO },
    ])
    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  // Own Tempo's `onHit` (Showdown, data/abilities.ts) names what it stops (#37).
  it('keeps what an immunity stops when the log names it', () => {
    const script = scriptOf('|-immune|p2a: Tyranitar|confusion|[from] ability: Own Tempo')

    expect(eventsFrom(script, NEXT)).toEqual([
      {
        kind: 'immune',
        line: NEXT,
        who: TYRANITAR,
        effect: { name: 'confusion' },
        cause: { name: 'Own Tempo', kind: 'ability' },
      },
    ])
    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  // Showdown's gen 3 `tryMoveHit` logs it once after a multi-hit move's last hit
  // (data/mods/gen3/scripts.ts), naming the target (#15).
  it('counts the hits of a multi-hit move', () => {
    const script = scriptOf('|-hitcount|p2a: Tyranitar|3')

    expect(eventsFrom(script, NEXT)).toEqual([
      { kind: 'hitCount', line: NEXT, who: TYRANITAR, hits: 3 },
    ])
    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
  })
})

// Showdown's Gen 1 to 3 rules log `-ohko` after the hit that knocks out with a one-hit KO move,
// and `-notarget` after a move whose target is gone (data/mods/gen3/scripts.ts); Gen 1 names no
// Pokémon in it (data/mods/gen1/scripts.ts).
describe('a one-hit KO and a move without a target', () => {
  it('reads the one-hit KO', () => {
    const script = scriptOf('|-damage|p2a: Tyranitar|0 fnt', '|-ohko')

    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT + 1)).toEqual([{ kind: 'ohko', line: NEXT + 1 }])
  })

  it('reads the user of a move without a target, and the Gen 1 line without one', () => {
    const script = scriptOf(
      '|move|p2a: Tyranitar|Earthquake||[notarget]',
      '|-notarget|p2a: Tyranitar',
      '|-notarget',
    )

    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
    expect(eventsFrom(script, NEXT + 1)).toEqual([
      { kind: 'noTarget', line: NEXT + 1, who: TYRANITAR },
      { kind: 'noTarget', line: NEXT + 2 },
    ])
  })
})
