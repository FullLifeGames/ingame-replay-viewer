import { describe, expect, it } from 'vitest'

import { newBattle } from '../client'
import { eventsAt, NEXT, scriptOf } from '../testing'
import { BATTLE_RULES } from './battle'

describe('the player rule', () => {
  it('refuses a player line without a name, which dropReasonOf drops before it', () => {
    const input = {
      line: 4,
      args: ['player', 'p2'] as const,
      kwArgs: {},
      battle: newBattle(),
      before: {
        active: { near: null, far: null },
        boosts: { near: {}, far: {} },
        weather: undefined,
        players: {},
      },
    }

    expect(() => BATTLE_RULES['|player|'].build(input)).toThrow(/^line 5: /)
  })
})

// Showdown's own lines in the battle, such as "Time's up! Going to tiebreaker..." (sim/battle.ts),
// read as `|-message|` does.
describe('the message rule', () => {
  it("reads the server's message as a message of the simulator", () => {
    const script = scriptOf("|message|Time's up! Going to tiebreaker...")

    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT)).toEqual([
      { kind: 'message', line: NEXT, text: "Time's up! Going to tiebreaker..." },
    ])
  })
})
