import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import type { BattleMonReading } from '../src/gen5/battle-mons'
import { moveLineLabel, sceneBlocks, sceneMove, textId, textLine } from './gen5-moment-scene'

// Invented readings in the shape the page reads from the clients' container.
const NEAR: BattleMonReading = {
  address: 0x02100000,
  monId: 4,
  species: 1,
  hp: 26,
  maxHp: 26,
  level: 9,
}
const FAR: BattleMonReading = {
  address: 0x02100200,
  monId: 9,
  species: 2,
  hp: 30,
  maxHp: 30,
  level: 9,
}
// Two invented setups, neither the game's: three clients with the near one (client 0) at
// position 1 and the far one (client 1) at position 2, and two clients in swapped order.
const INVENTED = { clientCount: 3, posClientIds: [2, 0, 1] }
const SWAPPED = { clientCount: 2, posClientIds: [1, 0] }
const BANK = 'Bank_Text_Zero = zero\nBank_Text_One = {0102:0} used\\nOne!\nBank_Text_Two = two\n'

// Scene: the game decides nothing. The first block's HP is one no damage roll of the move gives,
// the second block comes from the far side, and the "unknown" scene uses moves Tepig lacks. In the
// invented setup the near side stands at position 1 and the far side at position 2.
describe('sceneBlocks', () => {
  const tackle = Dex.forGen(5).moves.get('Tackle').num

  it('lets the near Pokémon hit the far one to 1 HP, then the far one answer', () => {
    const blocks = sceneBlocks('known', { near: NEAR, far: FAR }, INVENTED, 41)
    expect(blocks.map((block) => block.name)).toEqual(['b1', 'b2'])
    expect(blocks[0]?.moment).toEqual({
      attacker: { monId: 4, pos: 1 },
      target: { monId: 9, pos: 2, hp: 30, maxHp: 30 },
      move: tackle,
      hpAfter: 1,
      stdMessage: 41,
    })
    expect(blocks[1]?.moment).toMatchObject({
      attacker: { monId: 9, pos: 2 },
      target: { monId: 4, pos: 1, hp: 26 },
      move: tackle,
    })
  })

  it('takes moves by their @pkmn/dex numbers in the unknown scene', () => {
    const moves = sceneBlocks('unknown', { near: NEAR, far: FAR }, INVENTED, 41).map(
      (b) => b.moment.move,
    )
    const dex = Dex.forGen(5).moves
    expect(moves).toEqual([dex.get('Flamethrower').num, dex.get('Hydro Pump').num])
  })

  // In the swapped setup the near side stands at position 1 and the far side at position 0.
  it("takes each side's position from the single battle's setup", () => {
    const [b1] = sceneBlocks('known', { near: NEAR, far: FAR }, SWAPPED, 41)
    expect(b1?.moment.attacker).toEqual({ monId: 4, pos: 1 })
    expect(b1?.moment.target).toMatchObject({ monId: 9, pos: 0 })
  })
})

describe('textId and textLine', () => {
  it("gives a label's message ID, its line minus one, and the line of an ID", () => {
    expect(textId(BANK, 'Bank_Text_Two')).toBe(2)
    expect(textLine(BANK, 1)).toBe('{0102:0} used\\nOne!')
    expect(() => textId(BANK, 'Bank_Text_Absent')).toThrow(/Absent/)
    expect(() => textLine(BANK, 9)).toThrow(/9/)
  })
})

// Scene: the log names a move's line by its label, as it names the standard line, so no rule of
// the bank's order stays in code. The bank and its order are invented.
describe('moveLineLabel and sceneMove', () => {
  const MOVES = 'Bank0016_Text_FoesUsedHydroPump = f\nBank0016_Text_UsedDoubleEdge = n\n'

  it("gives the near side's and the far side's label of a move, its name without spaces", () => {
    expect(moveLineLabel('Hydro Pump', 'far')).toBe('Bank0016_Text_FoesUsedHydroPump')
    expect(textId(MOVES, moveLineLabel('Double-Edge', 'near'))).toBe(1)
    expect(() => moveLineLabel('No Such Move', 'near')).toThrow(/No Such Move/)
  })

  it("names each side's move of a scene", () => {
    expect([sceneMove('unknown', 'near'), sceneMove('unknown', 'far')]).toEqual([
      'Flamethrower',
      'Hydro Pump',
    ])
  })
})
