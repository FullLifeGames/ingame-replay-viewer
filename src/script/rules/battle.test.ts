import { describe, expect, it } from 'vitest'

import { newBattle } from '../client'
import { BATTLE_RULES } from './battle'

describe('the player rule', () => {
  it('refuses a player line without a name, which dropReasonOf drops before it', () => {
    const input = {
      line: 4,
      args: ['player', 'p2'] as const,
      kwArgs: {},
      battle: newBattle(),
      before: { active: { near: null, far: null }, weather: undefined },
    }

    expect(() => BATTLE_RULES['|player|'].build(input)).toThrow(/^line 4: /)
  })
})
