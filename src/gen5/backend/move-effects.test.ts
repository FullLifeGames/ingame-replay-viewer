import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, effectWrites, FAR, NEAR, writtenAt } from './effect-testing.ts'
import { lineId } from './lines.ts'
import { MOVE_EFFECT_SEQUENCES } from './move-effects.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40 at position 0, against Tyranitar, mon
// ID 10 at position 1. Line 0 is the first line after `|turn|1`. The scenes take their lines
// from the two Gen 5 OU test replays.
const DUGTRIO = NEAR.firstMonId
const TYRANITAR = FAR.firstMonId

const set = (line: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_EFFECT_LINES[line]),
  args,
})
const writes = (...lines: string[]) => effectWrites(MOVE_EFFECT_SEQUENCES, ...lines)

// Scene: Politoed protects itself, and Darmanitan's U-turn meets the protection
// (gen5ou-2718717830, turn 1). HandlerProtect sets its turn flag and its counter, which the
// client's view never reads, and puts its line; ServerControl_RemoveNoEffectTargets puts the
// block's line.
describe('Protect', () => {
  const all = writes(
    '|move|p1a: Dugtrio|Protect|p1a: Dugtrio',
    '|-singleturn|p1a: Dugtrio|Protect',
    '|move|p2a: Tyranitar|U-turn|p1a: Dugtrio',
    '|-activate|p1a: Dugtrio|move: Protect',
  )

  it('shows its line', () => {
    expect(writtenAt(all, 1)).toEqual([set('protected', DUGTRIO)])
  })

  it("shows the block's line for the Pokémon it protects", () => {
    expect(writtenAt(all, 3)).toEqual([set('protectBlocked', DUGTRIO)])
  })
})

// Scene: Breloom tightens its focus before the turn's moves (smogtours-gen5ou-862240, turn 4).
// HandlerFocuspunch sets a turn flag, then BattleHandler_EffectAtPos hides the message window and
// plays the effect at the user's position, and the handler's line follows.
describe('Focus Punch', () => {
  it('hides the window, plays the focus effect at the user and shows the line', () => {
    const all = writes('|-singleturn|p1a: Dugtrio|move: Focus Punch')
    expect(writtenAt(all, 0)).toEqual([
      cmd('SC_HIDE_MSG_WINDOW', NUMBERS.effects.hideWindow),
      cmd('SC_EFFECT_BY_POS', NEAR.pos, NUMBERS.effects.focusEffect),
      set('focusing', DUGTRIO),
    ])
  })
})

// Scene: Conkeldurr's Drain Punch hits Landorus and drains its HP (smogtours-gen5ou-862240, turn
// 8). ServerControl_DamageDrain heals through ServerControl_RecoverHPCore and names the Pokémon
// drained.
describe('a drain', () => {
  it('heals with the effect, the HP and the gauge, then names the Pokémon drained', () => {
    const all = writes(
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|76/100',
      '|move|p2a: Tyranitar|Drain Punch|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|74/100',
      '|-heal|p2a: Tyranitar|88/100|[from] drain|[of] p1a: Dugtrio',
    )
    expect(writtenAt(all, 4)).toEqual([
      cmd('SC_EFFECT_BY_POS', FAR.pos, NUMBERS.flow.recoverEffect),
      cmd('SC_OP_ADD_HP', TYRANITAR, 12),
      cmd('SC_UPDATE_HP_GAUGE', TYRANITAR),
      set('drained', DUGTRIO),
    ])
  })
})

// Scene: an effect of a move that this module has no sequence for writes nothing.
describe('the move effects it leaves', () => {
  it('writes nothing for Endure, another block, another heal or a drain with no source', () => {
    const all = writes(
      '|-singleturn|p1a: Dugtrio|move: Endure',
      '|-block|p1a: Dugtrio|move: Quick Guard',
      '|-heal|p1a: Dugtrio|100/100|[from] item: Leftovers',
      '|-heal|p1a: Dugtrio|100/100|[from] drain',
    )
    expect([0, 1, 2, 3].map((at) => writtenAt(all, at))).toEqual(Array(4).fill(undefined))
  })
})
