import { describe, expect, it } from 'vitest'

import type { ScriptEvent } from '../../script/events.ts'
import { NEXT, scriptOf } from '../../script/testing.ts'
import type { PokemonRef } from '../../script/types.ts'
import { writeScript } from './moves.ts'
import { gen5Move } from './names.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40, at position 0; Tyranitar, mon ID
// 10, at position 1. Line NEXT is `|turn|1`.

/** What the short log `|turn|1` and `lines` writes: its commands by name and first argument, and
 * its fallbacks by kind, line and detail. */
function written(...lines: string[]) {
  const { actions, fallbacks } = writeScript(scriptOf('|turn|1', ...lines), NUMBERS)
  return {
    commands: actions.flatMap((action) =>
      action.flatMap((event) =>
        event.commands.map((one) => `${one.command} ${String(one.args[0] ?? '')}`),
      ),
    ),
    fallbacks: fallbacks.map((one) =>
      one.kind === 'later' ? `${one.event} ${String(one.line - NEXT)} ${one.detail}` : one.kind,
    ),
  }
}

// Scene: a move animates from its user's position to its target's, or to the user's own when
// the log names no target; the server leaves the animation out when the move does not land.
describe('a move that plays', () => {
  it('animates from the user to the target, the user’s own position when none is named', () => {
    const { actions } = writeScript(
      scriptOf('|turn|1', '|move|p2a: Tyranitar|Dragon Dance', '|move|p1a: Dugtrio|Swords Dance'),
      NUMBERS,
    )
    expect(actions.flat().flatMap((event) => event.commands)).toEqual([
      { command: 'SC_MOVE_MSG', args: [10, gen5Move('Dragon Dance')] },
      { command: 'SC_MOVE_ANIM', args: [1, 1, gen5Move('Dragon Dance'), 0] },
      { command: 'SC_MOVE_MSG', args: [40, gen5Move('Swords Dance')] },
      { command: 'SC_MOVE_ANIM', args: [0, 0, gen5Move('Swords Dance'), 0] },
    ])
  })

  it('leaves the animation out before a miss that the move line does not flag', () => {
    expect(
      written('|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio', '|-miss|p2a: Tyranitar|p1a: Dugtrio')
        .commands,
    ).toEqual(['SC_MOVE_MSG 10', 'SC_MSG_SET 40'])
  })

  // Showdown logs Detect's block as Protect's. The block's own line waits for #109.
  it.each(['Protect', 'Quick Guard', 'Wide Guard'])(
    'leaves the animation out when %s blocks the move',
    (protection) => {
      expect(
        written(
          '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
          `|-activate|p1a: Dugtrio|move: ${protection}`,
        ).commands,
      ).toEqual(['SC_MOVE_MSG 10'])
    },
  )

  // Mist acts on the stat change, after the server chose the targets: no removal takes it.
  it('keeps the animation before a block by an effect that is no protection', () => {
    expect(
      written('|move|p2a: Tyranitar|Growl|p1a: Dugtrio', '|-activate|p1a: Dugtrio|move: Mist')
        .commands,
    ).toEqual(['SC_MOVE_MSG 10', 'SC_MOVE_ANIM 1'])
  })
})

// Scene: a move called by another, a multi-hit move, a charge turn and a look of its own wait
// whole for the issue that plays them; the bars of the hits still move.
describe('an action that waits whole', () => {
  it('lists a called move and its hit with #109, and moves the bar silently', () => {
    expect(
      written(
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[from]move: Sleep Talk',
        '|-damage|p2a: Tyranitar|60/100',
      ),
    ).toEqual({
      commands: ['SC_OP_SUBTRACT_HP 10', 'SC_UPDATE_HP_GAUGE 10'],
      fallbacks: ['damage 2 plays with #109'],
    })
  })

  it('lists a multi-hit move, its hits and the hit count with #110', () => {
    const lines = [
      '|move|p2a: Tyranitar|Rock Blast|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|80/100',
      '|-damage|p1a: Dugtrio|60/100',
      '|-hitcount|p1a: Dugtrio|2',
    ]
    expect(written(...lines)).toEqual({
      commands: [
        'SC_OP_SUBTRACT_HP 40',
        'SC_UPDATE_HP_GAUGE 40',
        'SC_OP_SUBTRACT_HP 40',
        'SC_UPDATE_HP_GAUGE 40',
      ],
      fallbacks: ['move 1 plays with #110', 'damage 2 plays with #110', 'damage 3 plays with #110'],
    })
  })

  it('lists a charge turn with #110', () => {
    expect(
      written('|move|p1a: Dugtrio|Solar Beam||[still]', '|-prepare|p1a: Dugtrio|Solar Beam'),
    ).toEqual({ commands: [], fallbacks: ['move 1 plays with #110'] })
  })
})

// Scene: lines that the writer has no sequence for where they stand.
describe('an event that plays elsewhere', () => {
  it('lists a hit on the user, a failure and a miss outside a move, with #110', () => {
    expect(
      written(
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
        '|-damage|p1a: Dugtrio|90/100',
        '|turn|2',
        '|-fail|p1a: Dugtrio',
        '|-miss|p2a: Tyranitar',
      ),
    ).toEqual({
      commands: [
        'SC_MOVE_MSG 40',
        'SC_MOVE_ANIM 0',
        'SC_OP_SUBTRACT_HP 40',
        'SC_UPDATE_HP_GAUGE 40',
      ],
      fallbacks: ['damage 2 plays with #110', 'fail 4 plays with #110', 'miss 5 plays with #110'],
    })
  })

  it('lists a miss and an immunity of another Pokémon than the target with #110', () => {
    expect(
      written(
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
        '|-immune|p1a: Dugtrio',
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
        '|-miss|p1a: Dugtrio|p1a: Dugtrio',
      ).fallbacks,
    ).toEqual(['immune 2 plays with #110', 'miss 4 plays with #110'])
  })
})

/** The script of the short log `|turn|1` and `lines`, with the event of log line `NEXT + at`
 * changed by hand into a line the log cannot hold. */
function handCast(
  at: number,
  change: Partial<Record<'who' | 'user', PokemonRef>>,
  ...lines: string[]
) {
  const script = scriptOf('|turn|1', ...lines)
  const events = script.events.map((event): ScriptEvent =>
    event.line === NEXT + at ? { ...event, ...change } : event,
  )
  return { ...script, events }
}

/** Bob sends in Skarmory, team index 1 of his side and so mon ID 11, then Tyranitar again. */
const BACK_AND_FORTH = [
  '|switch|p2a: Skarmory|Skarmory, M|100/100',
  '|turn|2',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
]

// Scene: the places follow each switch-in after the leads and each faint, in event order; an
// event that plays and names a Pokémon the game does not hold in place fails by name (lane plan
// D1).
describe('the Pokémon a switch-in sends in', () => {
  it('plays its Leftovers heal under its own mon ID, and moves its bar in its switch-in’s action', () => {
    expect(
      written(
        '|switch|p2a: Skarmory|Skarmory, M|100/100',
        '|-damage|p2a: Skarmory|50/100|[from] Stealth Rock',
        '|turn|2',
        '|-heal|p2a: Skarmory|56/100|[from] item: Leftovers',
      ),
    ).toEqual({
      commands: [
        'SC_OP_SUBTRACT_HP 11',
        'SC_UPDATE_HP_GAUGE 11',
        'SC_USE_HELD_ITEM 11',
        'SC_EFFECT_BY_POS 1',
        'SC_OP_ADD_HP 11',
        'SC_UPDATE_HP_GAUGE 11',
        'SC_MSG_SET 11',
      ],
      fallbacks: [],
    })
  })

  it('refuses by name the Leftovers heal of a Pokémon the game holds on the bench', () => {
    const script = handCast(
      4,
      { who: { side: 'far', index: 1 } },
      ...BACK_AND_FORTH,
      '|-heal|p2a: Tyranitar|100/100|[from] item: Leftovers',
    )
    expect(() => writeScript(script, NUMBERS)).toThrow(
      new Error(
        `line ${String(NEXT + 4)}: the log names Skarmory, which the game does not hold in place`,
      ),
    )
  })

  it('refuses by name a move of a Pokémon the game holds on the bench', () => {
    const script = handCast(
      4,
      { user: { side: 'far', index: 1 } },
      ...BACK_AND_FORTH,
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
    )
    expect(() => writeScript(script, NUMBERS)).toThrow(
      new Error(
        `line ${String(NEXT + 4)}: the log names Skarmory, which the game does not hold in place`,
      ),
    )
  })

  // The script reads a fainted Pokémon sent in again as a new team member: a hand-cast line.
  it('refuses by name a Pokémon sent in again after it fainted', () => {
    const script = handCast(
      6,
      { who: { side: 'far', index: 1 } },
      '|switch|p2a: Skarmory|Skarmory, M|100/100',
      '|-damage|p2a: Skarmory|0 fnt',
      '|faint|p2a: Skarmory',
      '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
      '|turn|2',
      '|switch|p2a: Gengar|Gengar, M|100/100',
    )
    expect(() => writeScript(script, NUMBERS)).toThrow(
      new Error(`line ${String(NEXT + 6)}: the log sends in Skarmory, which fainted`),
    )
  })
})
