import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import { chargeTurnOf } from './charge'

// The moves of Gen 1 to 3 that @pkmn marks as charging for a turn (`flags.charge`).
const CHARGING = Dex.moves.all().filter((move) => move.gen <= 3 && move.flags.charge === 1)

describe('the charge turns', () => {
  it('give each charging move of Gen 1 to 3 its line', () => {
    expect(CHARGING.length).toBeGreaterThan(5)
    const missing = CHARGING.filter((move) => chargeTurnOf(move.name) === undefined)
    expect(missing.map(({ name }) => name)).toEqual([])
  })

  it('play the line first, and the animation first for a move with a charge-turn effect', () => {
    expect(chargeTurnOf('Solar Beam')).toEqual({
      stringId: 'STRINGID_PKMNTOOKSUNLIGHT',
      animationFirst: false,
    })
    expect(chargeTurnOf('Skull Bash')?.animationFirst).toBe(true)
    expect(chargeTurnOf('Earthquake')).toBeUndefined()
  })
})
