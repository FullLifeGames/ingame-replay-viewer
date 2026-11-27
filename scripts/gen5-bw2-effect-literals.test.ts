import { describe, expect, it } from 'vitest'

import { checkEffectLiterals, effectLiterals } from './gen5-bw2-effect-literals'
import { effectNumbers } from './gen5-bw2-effects'
import { EFFECTS_CONSTANTS, EFFECTS_INPUT, EFFECTS_ITEMS } from './gen5-bw2-effects.fixtures'

const { flowC, movesC, posH } = EFFECTS_INPUT

// Scene: Knock Off, a held item's use, Focus Punch, a cure and a move that a status stops send a
// name's number where their C writes a literal (109-4's open points, the review's U3 and U4); the
// generator holds each literal to its name's value.
describe('effectLiterals', () => {
  const { addEffects } = effectNumbers(EFFECTS_INPUT, EFFECTS_CONSTANTS)
  const generated = {
    items: EFFECTS_ITEMS,
    constants: EFFECTS_CONSTANTS,
    hideWindow: 3,
    addEffects,
  }

  it('reads the literals at their calls', () => {
    expect(effectLiterals(EFFECTS_INPUT)).toEqual({
      knockOffItem: 0x2f,
      usedItem: 0x2f,
      effectAtPosHide: 3,
      focusPunchPos: 9,
      cureStatusIcon: 0x40,
      cureConditionIcon: 0x40,
      // The causes count from a value of their own, and a decoy case beside them.
      cantEffects: { CONDITION_SLEEP: 0x7a2, CONDITION_PARALYSIS: 0x7a8, CONDITION_FREEZE: 0x7a4 },
    })
    expect(() => {
      checkEffectLiterals(EFFECTS_INPUT, generated)
    }).not.toThrow()
  })

  it.each([
    [
      'movesC',
      'param->item = 0x2f;',
      'param->item = 0x30;',
      'HandlerKnockOff: the item it leaves is not ITEM_NONE',
    ],
    [
      'flowC',
      'ServerControl_ChangeHeldItem(flow, TRUE, mon, 0x2f);',
      'ServerControl_ChangeHeldItem(flow, TRUE, mon, 0x30);',
      'ServerControl_UseHeldItem: the item it passes is not ITEM_NONE',
    ],
    [
      'flowC',
      'handler->queue, SC_HIDE_MSG_WINDOW, 3)',
      'handler->queue, SC_HIDE_MSG_WINDOW, 5)',
      "BattleHandler_EffectAtPos: SC_HIDE_MSG_WINDOW's argument is not ServerControl_TurnCheck's",
    ],
    [
      'movesC',
      'effect->pos2 = 9;',
      'effect->pos2 = 8;',
      'HandlerFocuspunch: the second position is not BTL_POS_NONE',
    ],
    [
      'flowC',
      'SC_OP_CURE_CONDITION, monId);\n    BtlServerCmdQueue_Put(flow->queue, SC_SET_GAUGE_STATUS, monId, 0x40);',
      'SC_OP_CURE_CONDITION, monId);\n    BtlServerCmdQueue_Put(flow->queue, SC_SET_GAUGE_STATUS, monId, 0x3f);',
      'ServerControl_CureStatus: the icon it clears to is not CONDITION_NONE',
    ],
    [
      'flowC',
      'SC_SET_GAUGE_STATUS, monId, 0x40);\n        }',
      'SC_SET_GAUGE_STATUS, monId, 0x3f);\n        }',
      'ServerControl_CureCondition: the icon it clears to is not CONDITION_NONE',
    ],
    [
      'flowC',
      'case 0x23:\n            ServerDisplay_AddEffectAtPosition(flow, mon, 0x7a4);',
      'case 0x23:\n            ServerDisplay_AddEffectAtPosition(flow, mon, 0x7a6);',
      "ServerControl_MoveFail: the effect for CONDITION_FREEZE is not ServerControl_AddCondition's",
    ],
  ] as const)('names a literal apart from its name in %s', (role, from, to, message) => {
    const changed = { flowC, movesC, posH, [role]: EFFECTS_INPUT[role].replace(from, to) }
    expect(changed[role]).not.toBe(EFFECTS_INPUT[role])
    expect(() => {
      checkEffectLiterals(changed, generated)
    }).toThrow(new Error(message))
  })

  it('names generated items without ITEM_NONE and constants without CONDITION_NONE', () => {
    expect(() => {
      checkEffectLiterals(EFFECTS_INPUT, { ...generated, items: {} })
    }).toThrow(new Error('the generated items lack ITEM_NONE'))
    expect(() => {
      checkEffectLiterals(EFFECTS_INPUT, { ...generated, constants: {} })
    }).toThrow(new Error("the battle's constants lack CONDITION_NONE"))
  })

  // Scene: a pin that moves a cause or a case would send another effect for a stopped move.
  it.each([
    [
      'cause = 0x21;',
      'cause = cause;',
      'ServerControl_CheckMoveFail: the cause of CONDITION_SLEEP is no number literal',
    ],
    [
      'status == CONDITION_PARALYSIS &&',
      'status == CONDITION_BURN &&',
      'ServerControl_CheckMoveFail: no one cause of CONDITION_PARALYSIS',
    ],
    [
      'case 0x23:\n',
      'case 0x27:\n',
      'ServerControl_MoveFail: no one case for the cause of CONDITION_FREEZE',
    ],
    [
      'case 0x21:\n            ServerDisplay_AddEffectAtPosition(flow, mon, 0x7a2);',
      'case 0x21:\n            ServerDisplay_ViewEffect(flow, mon, 0x7a2);',
      'ServerControl_MoveFail: no one effect for the cause of CONDITION_SLEEP',
    ],
  ])('names a move fail it cannot read: %s', (from, to, message) => {
    const odd = flowC.replace(from, to)
    expect(odd).not.toBe(flowC)
    expect(() => effectLiterals({ flowC: odd, movesC })).toThrow(new Error(message))
  })
})
