import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import type { BattleMonReading } from '../src/gen5/battle-mons'
import { sceneBlocks, textId, textLine } from './gen5-moment-scene'

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
const BANK = 'Bank_Text_Zero = zero\nBank_Text_One = {0102:0} used\\nOne!\nBank_Text_Two = two\n'

// Scene: the game decides nothing. The first block's HP is one no damage roll of the move gives,
// the second block comes from the far side, and the "unknown" scene uses moves Tepig lacks.
describe('sceneBlocks', () => {
  const tackle = Dex.forGen(5).moves.get('Tackle').num

  it('lets the near Pokémon hit the far one to 1 HP, then the far one answer', () => {
    const blocks = sceneBlocks('known', { near: NEAR, far: FAR }, 41)
    expect(blocks.map((block) => block.name)).toEqual(['b1', 'b2'])
    expect(blocks[0]?.moment).toEqual({
      attacker: { monId: 4, pos: 0 },
      target: { monId: 9, pos: 1, hp: 30, maxHp: 30 },
      move: tackle,
      hpAfter: 1,
      stdMessage: 41,
    })
    expect(blocks[1]?.moment).toMatchObject({
      attacker: { monId: 9, pos: 1 },
      target: { monId: 4, pos: 0, hp: 26 },
      move: tackle,
    })
  })

  it('takes moves by their @pkmn/dex numbers in the unknown scene', () => {
    const moves = sceneBlocks('unknown', { near: NEAR, far: FAR }, 41).map((b) => b.moment.move)
    const dex = Dex.forGen(5).moves
    expect(moves).toEqual([dex.get('Flamethrower').num, dex.get('Hydro Pump').num])
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
