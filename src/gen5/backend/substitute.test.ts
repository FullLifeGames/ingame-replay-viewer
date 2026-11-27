import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, constant, effectScript, effectWrites, NEAR, writtenAt } from './effect-testing.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import { gen5Move } from './names.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'
import { SUBSTITUTE_SEQUENCES, substituteShows } from './substitute.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40 at position 0, against Tyranitar.
// Line 0 is the first line after `|turn|1`. The scenes take their lines from
// smogtours-gen5ou-862240, where Breloom makes a Substitute in turn 2 and U-turn breaks it in turn
// 3.
const DUGTRIO = NEAR.firstMonId

const set = (line: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_EFFECT_LINES[line]),
  args,
})
const std = (line: keyof typeof GEN5_LINES): ServerCommand => ({
  command: 'SC_MSG_STD',
  message: lineId(NUMBERS.text, GEN5_LINES[line]),
  args: [],
})
const writes = (...lines: string[]) => effectWrites(SUBSTITUTE_SEQUENCES, ...lines)

const START = [
  '|move|p1a: Dugtrio|Substitute|p1a: Dugtrio',
  '|-start|p1a: Dugtrio|Substitute',
  '|-damage|p1a: Dugtrio|75/100',
]

// Scene: the log puts the Substitute's start before its HP drop, the game the drop first
// (ServerControl_Substitute, D10): the start writes the whole sequence and shows the drop's line.
describe("a Substitute's start", () => {
  it('takes the HP with its gauge, makes the doll with its cost, then shows the line', () => {
    const all = writes(...START)
    expect(writtenAt(all, 1)).toEqual([
      cmd('SC_OP_SUBTRACT_HP', DUGTRIO, 25),
      cmd('SC_UPDATE_HP_GAUGE', DUGTRIO),
      cmd('SC_OP_CREATE_SUBSTITUTE', DUGTRIO, 25),
      cmd('SC_SUBSTITUTE_CREATE', NEAR.pos),
      set('substitute', DUGTRIO),
    ])
    // The drop is the start's: no hit plays for it, and its HP is in the game already.
    expect(writtenAt(all, 2)).toEqual([])
  })

  it("shows the HP drop's line besides its own, and nothing for other lines", () => {
    const { events } = effectScript(...START)
    const at = events.findIndex((event) => event.kind === 'effectStart')
    const drop = events[at + 1]
    expect(substituteShows(events, at)).toEqual([drop?.line])
    expect(substituteShows(events, at + 1)).toEqual([])
  })

  it('writes nothing without its HP drop, for another effect, or in silence', () => {
    const all = writes(
      '|-start|p1a: Dugtrio|Substitute',
      '|-damage|p1a: Dugtrio|100/100',
      '|-start|p1a: Dugtrio|Substitute',
      '|-start|p1a: Dugtrio|confusion',
      '|-start|p1a: Dugtrio|Substitute|[silent]',
      '|-end|p1a: Dugtrio|Substitute|[silent]',
    )
    expect([0, 2, 3, 4, 5].map((at) => writtenAt(all, at))).toEqual(Array(5).fill(undefined))
  })
})

/** ServerControl_DamageSubstitute's start: the hit's effect with the effectiveness and the move,
 * and the doll's line. */
const hit = (effectiveness: string, move: string) => [
  cmd('SC_DAMAGE_EFFECT', DUGTRIO, constant(effectiveness), gen5Move(move)),
  set('substituteHit', DUGTRIO),
]

describe('a hit on the Substitute', () => {
  it('shows the hit, its line and the critical line, and the doll stays', () => {
    const all = writes(
      ...START,
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|-crit|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Substitute|[damage]',
    )
    expect(writtenAt(all, 5)).toEqual([
      ...hit('TYPE_EFFECTIVENESS_NORMAL', 'Crunch'),
      std('critical'),
    ])
  })

  it('shows the hit and its lines, then the faded line, and takes the doll away', () => {
    const all = writes(
      ...START,
      '|move|p2a: Tyranitar|U-turn|p1a: Dugtrio',
      '|-end|p1a: Dugtrio|Substitute',
    )
    expect(writtenAt(all, 4)).toEqual([
      ...hit('TYPE_EFFECTIVENESS_NORMAL', 'U-turn'),
      set('substituteFaded', DUGTRIO),
      cmd('SC_OP_DELETE_SUBSTITUTE', DUGTRIO),
      cmd('SC_SUBSTITUTE_DELETE', NEAR.pos),
    ])
  })

  it('gives the hit the effectiveness the log names, with its line', () => {
    const all = writes(
      ...START,
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|-resisted|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Substitute|[damage]',
      '|move|p2a: Tyranitar|Surf|p1a: Dugtrio',
      '|-supereffective|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Substitute|[damage]',
    )
    expect(writtenAt(all, 5)).toEqual([
      ...hit('TYPE_EFFECTIVENESS_HALF', 'Crunch'),
      std('notVeryEffective'),
    ])
    expect(writtenAt(all, 8)).toEqual([
      ...hit('TYPE_EFFECTIVENESS_DOUBLE', 'Surf'),
      std('superEffective'),
    ])
  })

  it('writes nothing for an end or a hit with no move on the holder before it', () => {
    const all = writes(
      ...START,
      '|-end|p1a: Dugtrio|Substitute',
      '|move|p2a: Tyranitar|Swords Dance|p2a: Tyranitar',
      '|-activate|p1a: Dugtrio|move: Substitute|[damage]',
      '|-activate|p1a: Dugtrio|move: Protect',
    )
    expect([3, 5, 6].map((at) => writtenAt(all, at))).toEqual([undefined, undefined, undefined])
  })
})
