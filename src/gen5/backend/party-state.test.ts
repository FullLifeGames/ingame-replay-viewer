import { describe, expect, it } from 'vitest'

import { sendInSwap } from './party-state.ts'

// Scene: BattleParty_Swap swaps two pointers of the party, the front's and the incoming
// Pokémon's, and leaves every other slot as it was.
describe('sendInSwap', () => {
  it('swaps the entries at the two slots and leaves the rest', () => {
    const order = [4, 0, 2, 5]
    expect(sendInSwap(order, 0, 2)).toEqual([2, 0, 4, 5])
    expect(order).toEqual([4, 0, 2, 5])
  })

  it('changes nothing when the two slots are one', () => {
    expect(sendInSwap([4, 0, 2], 1, 1)).toEqual([4, 0, 2])
  })

  it('refuses a slot the party does not have', () => {
    expect(() => sendInSwap([4, 0], 0, 2)).toThrow('the party of 2 has no slot 2')
    expect(() => sendInSwap([4, 0], 3, 0)).toThrow('the party of 2 has no slot 3')
  })
})
