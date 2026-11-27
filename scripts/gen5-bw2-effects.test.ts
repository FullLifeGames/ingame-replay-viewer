import { describe, expect, it } from 'vitest'

import {
  caseLiteral,
  checkEffectLiterals,
  conditionValues,
  effectLiterals,
  effectNumbers,
  memberInAbilities,
  sandEffects,
  sideMask,
  weatherTurns,
} from './gen5-bw2-effects'
import { EFFECTS_CONSTANTS, EFFECTS_INPUT, EFFECTS_ITEMS } from './gen5-bw2-effects.fixtures'

const { flowC, mainC, posH, abilitiesC, movesC } = EFFECTS_INPUT

// Scene: each effect's sequence sends the numbers the server's flow puts, read from the invented C.
describe('effectNumbers', () => {
  it('reads every effect number from the invented C', () => {
    expect(effectNumbers(EFFECTS_INPUT, EFFECTS_CONSTANTS)).toEqual({
      addEffects: {
        CONDITION_SLEEP: 0x7a2,
        CONDITION_FREEZE: 0x7a4,
        CONDITION_POISON: 0x7a6,
        CONDITION_PARALYSIS: 0x7a8,
        CONDITION_BURN: 0x7aa,
      },
      damageEffects: { CONDITION_POISON: 0x7b1, CONDITION_BURN: 0x7b3 },
      // The types count on from 2, and `common` holds 4 bits of padding, the turns in 7 bits and
      // the type in 5 above them.
      conditionValues: {
        permanent: 4 << 11,
        badlyPoisoned: (4 << 11) | (21 << 4),
        sleep: (3 << 11) | (9 << 4),
      },
      badlyPoisonedGauge: 0x41 + 3,
      weatherTurns: 0x3c,
      sideMask: 0x10,
      sandEffects: { hit: 0x7c2, after: 0x7c5 },
      hideWindow: 3,
      focusEffect: 0x7d1,
      memberInAbilities: ['ABILITY_INTIMIDATE', 'ABILITY_DROUGHT', 'ABILITY_DRIZZLE'],
    })
  })
})

describe('caseLiteral', () => {
  it("takes the one literal of a case's branch up to its break", () => {
    expect(caseLiteral(flowC, 'ServerControl_ConditionDamage', 'CONDITION_BURN')).toBe(0x7b3)
  })

  it('names a case the switch lacks', () => {
    expect(() => caseLiteral(flowC, 'ServerControl_ConditionDamage', 'CONDITION_SLEEP')).toThrow(
      new Error('ServerControl_ConditionDamage has no case CONDITION_SLEEP'),
    )
  })

  // The error names the role alone, never the C it met: a named effect shows no number.
  it('refuses a branch without one number literal', () => {
    const named = flowC.replace('mon, 0x7b3)', 'mon, EFFECT_BURN)')
    expect(() => caseLiteral(named, 'ServerControl_ConditionDamage', 'CONDITION_BURN')).toThrow(
      new Error(
        'ServerControl_ConditionDamage: the effect of case CONDITION_BURN is not one literal',
      ),
    )
    const two = flowC.replace('mon, 0x7b3)', 'mon, 0x7b3 + 2)')
    expect(() => caseLiteral(two, 'ServerControl_ConditionDamage', 'CONDITION_BURN')).toThrow(
      new Error(
        'ServerControl_ConditionDamage: the effect of case CONDITION_BURN is not one literal',
      ),
    )
  })

  it('refuses a case that stands twice', () => {
    const twice = flowC.replace('case CONDITION_CURSE:', 'case CONDITION_BURN:')
    expect(() => caseLiteral(twice, 'ServerControl_ConditionDamage', 'CONDITION_BURN')).toThrow(
      new Error('ServerControl_ConditionDamage names case CONDITION_BURN not exactly once'),
    )
  })
})

// Scene: a held status keeps its icon after a send-out only with a value the client reads as one.
describe('conditionValues', () => {
  it('names a BattleCondition without the struct member common', () => {
    const input = {
      ...EFFECTS_INPUT,
      pokeparamH: EFFECTS_INPUT.pokeparamH.replace('} common;', '} other;'),
    }
    expect(() => conditionValues(input)).toThrow(
      new Error('struct BattleCondition has no struct member common'),
    )
  })

  it('refuses turns that do not fit their bits', () => {
    const input = {
      ...EFFECTS_INPUT,
      pokeparamH: EFFECTS_INPUT.pokeparamH.replace('u32 turns : 7', 'u32 turns : 3'),
    }
    expect(() => conditionValues(input)).toThrow(
      new Error('BattleCondition: common.turns is too narrow for bad poison'),
    )
  })

  it('refuses a sleep whose upper turns are no literal', () => {
    const input = { ...EFFECTS_INPUT, calcC: EFFECTS_INPUT.calcC.replace('(9, 3)', '(MAX, 3)') }
    expect(() => conditionValues(input)).toThrow(
      new Error('BtlCalc_MakeStatusCondition: the max is no number literal'),
    )
  })
})

describe('weatherTurns', () => {
  it('refuses a second call', () => {
    const twice = flowC.replace(
      'flow->result = 2;',
      'ServerControl_ChangeWeather(flow, 0x3c, weather);',
    )
    expect(() => weatherTurns(twice)).toThrow(
      new Error('BtlServerFlow_StartBattle calls ServerControl_ChangeWeather not exactly once'),
    )
  })

  it('refuses turns that are no literal', () => {
    const named = flowC.replace('(flow, 0x3c, weather)', '(flow, TURNS, weather)')
    expect(() => weatherTurns(named)).toThrow(
      new Error('BtlServerFlow_StartBattle: the turns is no number literal'),
    )
  })
})

// Scene: sand hurts each Pokémon at its place, then shows one effect over the field.
describe('sandEffects', () => {
  it('refuses a third effect in the damage', () => {
    const thrice = flowC.replace('if (lethal) {', 'ServerControl_ViewEffect(flow, 9, 1, 9, 0);\n{')
    expect(() => sandEffects(thrice, posH)).toThrow(
      new Error('ServerControl_WeatherDamage calls ServerControl_ViewEffect not exactly twice'),
    )
  })

  it('refuses a hit that goes out between two places', () => {
    const between = flowC.replace(
      'ServerControl_ViewEffect(flow, 9, 0x7c2',
      'ServerControl_ViewEffect(flow, 2, 0x7c2',
    )
    expect(() => sandEffects(between, posH)).toThrow(
      new Error('ServerControl_WeatherDamage: the hit is no effect at one position'),
    )
  })

  it('refuses an after effect at a position', () => {
    const placed = flowC.replace(
      '(flow, BTL_POS_NONE, 0x7c5, 9, 0)',
      '(flow, BTL_POS_NONE, 0x7c5, pos, 0)',
    )
    expect(() => sandEffects(placed, posH)).toThrow(
      new Error(
        'ServerControl_TurnCheckWeather: the effect after the hits is an effect at a position',
      ),
    )
  })
})

describe('sideMask', () => {
  it('refuses a side by another rule', () => {
    const other = mainC.replace('return clientId & 0x10;', 'return clientId >> 1;')
    expect(() => sideMask(other)).toThrow(
      new Error('GetClientSide: no return clientId & <literal>'),
    )
  })
})

// Scene: a lead's switch-in ability plays before the first turn in the game, which the log may not
// show.
describe('memberInAbilities', () => {
  it('refuses an entry of the table it cannot read', () => {
    const odd = abilitiesC.replace('{ ABILITY_DROUGHT, EventAddDrizzle }', 'ABILITY_DROUGHT')
    expect(() => memberInAbilities(odd)).toThrow(
      new Error('sAbilityEventAddTable: an entry is no { ABILITY_*, EventAdd* }'),
    )
  })

  it('refuses an adder that returns no handler table by name', () => {
    const odd = abilitiesC.replace('return sHandlersIntimidate;', 'return table;')
    expect(() => memberInAbilities(odd)).toThrow(
      new Error('EventAddIntimidate returns no handler table by name'),
    )
  })

  it('names a handler table the source lacks', () => {
    const odd = abilitiesC.replace('sHandlersIntimidate[] =', 'sHandlersOther[] =')
    expect(() => memberInAbilities(odd)).toThrow(new Error('no handler table sHandlersIntimidate'))
  })
})

// Scene: Knock Off, a held item's use and Focus Punch send a name's number where their C writes a
// literal (109-4's open points); the generator holds each literal to its name's value.
describe('effectLiterals', () => {
  const generated = { items: EFFECTS_ITEMS, hideWindow: 3 }

  it('reads the four literals at their calls', () => {
    expect(effectLiterals(EFFECTS_INPUT)).toEqual({
      knockOffItem: 0x2f,
      usedItem: 0x2f,
      effectAtPosHide: 3,
      focusPunchPos: 9,
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
  ] as const)('names a literal apart from its name in %s', (role, from, to, message) => {
    const changed = { flowC, movesC, posH, [role]: EFFECTS_INPUT[role].replace(from, to) }
    expect(changed[role]).not.toBe(EFFECTS_INPUT[role])
    expect(() => {
      checkEffectLiterals(changed, generated)
    }).toThrow(new Error(message))
  })

  it('names generated items without ITEM_NONE', () => {
    expect(() => {
      checkEffectLiterals(EFFECTS_INPUT, { items: {}, hideWindow: 3 })
    }).toThrow(new Error('the generated items lack ITEM_NONE'))
  })
})
