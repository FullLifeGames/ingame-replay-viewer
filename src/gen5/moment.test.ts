import { describe, expect, it } from 'vitest'

import { type Moment, momentCommands } from './moment'

// Invented mon IDs, positions and message; the move is a @pkmn/dex number (Tackle).
const MOMENT: Moment = {
  attacker: { monId: 4, pos: 2 },
  target: { monId: 9, pos: 3, hp: 120, maxHp: 130 },
  move: 33,
  hpAfter: 60,
  stdMessage: 41,
}

const shown = (moment: Moment) =>
  momentCommands(moment).map(
    (entry) =>
      `${entry.command} ${entry.args.join(',')}${entry.message === undefined ? '' : ` #${String(entry.message)}`}`,
  )

// Scene: the HP bar must go to the given value, never past it, and the game decides nothing:
// the block says who moves, which move, and where the bar ends.
describe('momentCommands', () => {
  it('gives the line, the animation, the HP change, the bar and the standard line in order', () => {
    expect(shown(MOMENT)).toEqual([
      'SC_MOVE_MSG 4,33',
      'SC_MOVE_ANIM 2,3,33,0',
      'SC_OP_SUBTRACT_HP 9,60',
      'SC_UPDATE_HP_GAUGE 9',
      'SC_MSG_STD  #41',
    ])
  })

  it('adds HP when the given value lies above the current one', () => {
    expect(shown({ ...MOMENT, hpAfter: 125 })[2]).toBe('SC_OP_ADD_HP 9,5')
  })

  it('leaves out the HP change and the bar when the HP stays, and the line when none is given', () => {
    const plain: Moment = { ...MOMENT, hpAfter: 120 }
    delete plain.stdMessage
    expect(shown(plain)).toEqual(['SC_MOVE_MSG 4,33', 'SC_MOVE_ANIM 2,3,33,0'])
  })

  it('refuses an HP below 0, above the maximum, or not whole', () => {
    expect(() => momentCommands({ ...MOMENT, hpAfter: -1 })).toThrow(/-1/)
    expect(() => momentCommands({ ...MOMENT, hpAfter: 131 })).toThrow(/131.*130/)
    expect(() => momentCommands({ ...MOMENT, hpAfter: 1.5 })).toThrow(/1\.5/)
  })

  it('refuses a current HP above the maximum, which no read of the game gives', () => {
    const target = { ...MOMENT.target, hp: 140 }
    expect(() => momentCommands({ ...MOMENT, target })).toThrow(/140/)
  })
})
