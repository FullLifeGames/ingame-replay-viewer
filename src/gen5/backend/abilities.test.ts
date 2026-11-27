import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { ABILITY_SEQUENCES } from './abilities.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, constant, effectWrites, FAR, NEAR, writtenAt } from './effect-testing.ts'
import { lineId } from './lines.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40 at position 0, against Tyranitar, mon
// ID 10 at position 1; Bob's next Pokémon takes mon ID 11. Line 0 is the first line after
// `|turn|1`. The scenes take their lines from the two Gen 5 OU test replays.
const DUGTRIO = NEAR.firstMonId
const TYRANITAR = FAR.firstMonId
const LANDORUS = FAR.firstMonId + 1

const set = (line: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_EFFECT_LINES[line]),
  args,
})
const writes = (...lines: string[]) => effectWrites(ABILITY_SEQUENCES, ...lines)
const popIn = (monId: number) => cmd('SC_ABILITY_POPUP_IN', monId)
const popOut = (monId: number) => cmd('SC_ABILITY_POPUP_OUT', monId)

// Scene: Landorus comes in and its Intimidate lowers Breloom's Attack (smogtours-gen5ou-862240,
// turn 5). HandlerIntimidateMemberIn runs the pop-up's start, the stat change and its end, so the
// pop-up stands from the ability's line to the drop's.
describe('Intimidate', () => {
  it('shows the pop-up at the ability and closes it after the drop of its run', () => {
    const all = writes(
      '|switch|p2a: Landorus|Landorus-Therian, M|100/100',
      '|-ability|p2a: Landorus|Intimidate|boost',
      '|-unboost|p1a: Dugtrio|atk|1',
    )
    const args = [DUGTRIO, constant('BATTLEMON_ATTACK_STAGE'), 1]
    expect(writtenAt(all, 1)).toEqual([popIn(LANDORUS)])
    expect(writtenAt(all, 2)).toEqual([
      cmd('SC_OP_LOWER_STAT_STAGE', ...args),
      cmd('SC_STAT_DOWN_EFFECT', ...args),
      set('statFell', ...args),
      popOut(LANDORUS),
    ])
  })

  it('closes the pop-up at once when no drop follows', () => {
    const all = writes(
      '|-ability|p2a: Tyranitar|Intimidate|boost',
      '|-fail|p1a: Dugtrio|unboost|Attack|[from] ability: Hyper Cutter|[of] p1a: Dugtrio',
    )
    expect(writtenAt(all, 0)).toEqual([popIn(TYRANITAR), popOut(TYRANITAR)])
  })

  it('leaves a drop outside its run and every other ability', () => {
    const all = writes(
      '|move|p1a: Dugtrio|Close Combat|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|20/100',
      '|-unboost|p1a: Dugtrio|def|1',
      '|-ability|p2a: Tyranitar|Pressure',
      '|-ability|p1a: Dugtrio|Intimidate|boost',
      '|-unboost|p1a: Dugtrio|atk|1',
    )
    expect([2, 3, 5].map((at) => writtenAt(all, at))).toEqual([undefined, undefined, undefined])
    expect(writtenAt(all, 4)).toEqual([popIn(DUGTRIO), popOut(DUGTRIO)])
  })
})

// Scene: Scizor's Quick Attack hits Ferrothorn, whose Iron Barbs hurt Scizor
// (gen5ou-2718717830, turn 19). HandlerRoughSkin's damage goes through BattleHandler_Damage with
// its holder's pop-up around it.
describe('Iron Barbs', () => {
  it("wraps the attacker's HP, gauge and line in the holder's pop-up", () => {
    const all = writes(
      '|move|p1a: Dugtrio|Quick Attack|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|83/100',
      '|-damage|p1a: Dugtrio|88/100|[from] ability: Iron Barbs|[of] p2a: Tyranitar',
    )
    expect(writtenAt(all, 2)).toEqual([
      popIn(TYRANITAR),
      cmd('SC_OP_SUBTRACT_HP', DUGTRIO, 12),
      cmd('SC_UPDATE_HP_GAUGE', DUGTRIO),
      set('ironBarbs', DUGTRIO),
      popOut(TYRANITAR),
    ])
  })
})

// Scene: Breloom's Poison Heal restores HP at the turn's end (smogtours-gen5ou-862240, turn 2).
// HandlerPoisonHeal's heal goes through BattleHandler_RecoverHP with the pop-up and no line.
describe('Poison Heal', () => {
  it('wraps the heal effect, the HP and the gauge in the pop-up, with no line', () => {
    const all = writes(
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|25/100',
      '|-heal|p1a: Dugtrio|38/100 tox|[from] ability: Poison Heal',
    )
    expect(writtenAt(all, 2)).toEqual([
      popIn(DUGTRIO),
      cmd('SC_EFFECT_BY_POS', NEAR.pos, NUMBERS.flow.recoverEffect),
      cmd('SC_OP_ADD_HP', DUGTRIO, 13),
      cmd('SC_UPDATE_HP_GAUGE', DUGTRIO),
      popOut(DUGTRIO),
    ])
  })

  it('leaves the heals and damage of other causes', () => {
    const all = writes(
      '|-damage|p1a: Dugtrio|80/100|[from] item: Life Orb',
      '|-heal|p1a: Dugtrio|90/100|[from] item: Leftovers',
      '|-heal|p2a: Tyranitar|100/100|[from] ability: Volt Absorb|[of] p1a: Dugtrio',
    )
    expect([0, 1, 2].map((at) => writtenAt(all, at))).toEqual([undefined, undefined, undefined])
  })
})
