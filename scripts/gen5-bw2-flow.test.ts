import { describe, expect, it } from 'vitest'

import type { TextNumbers } from '../src/gen5/bw2-numbers'
import { GEN5_LINES } from '../src/gen5/backend/lines'
import { checkLineSources, damageKinds, flowNumbers, putIds, recoverEffect } from './gen5-bw2-flow'
import { FLOW_INPUT } from './gen5-bw2-flow.fixtures'
import { TEXT_INPUT } from './gen5-bw2-text.fixtures'
import { textNumbers } from './gen5-bw2-text'

const FLOW = 'src/battle/btl_server_flow.c'
const ITEMS = 'src/battle/handler/item_handlers.c'

/** An invented body of ServerDisplay_Damage with the given chain inside. */
const damage = (chain: string) =>
  `void ServerDisplay_Damage(BtlServerFlow *flow, u32 count) {\n    u32 kind;\n${chain}\n` +
  '    BtlServerCmdQueue_Put(flow->queue, SC_DAMAGE_PLURAL, (u8)count, (u8)kind, move);\n}\n'

// Scene: the hit flash's command carries the effectiveness category, which picks the hit sound.
describe('damageKinds', () => {
  it('reads the three kinds from the if chain', () => {
    expect(flowNumbers(FLOW_INPUT).damageKinds).toEqual({ super: 7, resisted: 4, plain: 5 })
  })

  it('refuses a chain in another order', () => {
    const swapped = damage(
      '    if (notVeryEffective) {\n        kind = 4;\n    } else if (superEffective) {\n' +
        '        kind = 7;\n    } else {\n        kind = 5;\n    }',
    )
    expect(() => damageKinds(swapped)).toThrow(
      'ServerDisplay_Damage: no chain if (superEffective) … else if (notVeryEffective) … else',
    )
  })

  it('refuses a kind that is no literal', () => {
    const named = damage(
      '    if (superEffective) { kind = KIND_A; } else if (notVeryEffective) { kind = 4; }' +
        ' else { kind = 5; }',
    )
    expect(() => damageKinds(named)).toThrow(
      'ServerDisplay_Damage: the kind "KIND_A" is no literal',
    )
  })

  it('refuses a kind set again after the chain', () => {
    const again = damage(
      '    if (superEffective) { kind = 7; } else if (notVeryEffective) { kind = 4; }' +
        ' else { kind = 5; }\n    kind = 9;',
    )
    expect(() => damageKinds(again)).toThrow('ServerDisplay_Damage sets kind outside its chain')
  })

  it('refuses a body that sends no SC_DAMAGE_PLURAL with the kind', () => {
    const chain =
      '    if (superEffective) { kind = 7; } else if (notVeryEffective) { kind = 4; } else { kind = 5; }'
    const without = damage(chain).replace('(u8)kind', '(u8)count')
    expect(() => damageKinds(without)).toThrow(
      'ServerDisplay_Damage sends no SC_DAMAGE_PLURAL with the kind',
    )
  })
})

// Scene: a heal by Leftovers shows the heal effect at the Pokémon's position before its bar fills.
describe('recoverEffect', () => {
  it("reads SC_EFFECT_BY_POS's literal effect", () => {
    expect(flowNumbers(FLOW_INPUT).recoverEffect).toBe(0x9c)
  })

  it('refuses an effect that is no literal, and a body with two', () => {
    const body = (puts: string) =>
      `void ServerControl_RecoverHPCore(BtlServerFlow *flow, u16 amount) {\n${puts}\n}\n`
    const put = (effect: string) =>
      `    BtlServerCmdQueue_Put(flow->queue, SC_EFFECT_BY_POS, pos, ${effect});`
    expect(() => recoverEffect(body(put('EFFECT_HEAL')))).toThrow(
      'ServerControl_RecoverHPCore: the effect "EFFECT_HEAL" is no literal',
    )
    expect(() => recoverEffect(body(`${put('1')}\n${put('2')}`))).toThrow(
      'ServerControl_RecoverHPCore puts SC_EFFECT_BY_POS 2 times, not once',
    )
  })
})

// Scene: the cross-check needs the message IDs a function puts, by the command they go through.
describe('putIds', () => {
  it('gives the literal IDs of one message command alone', () => {
    const effectiveness = 'ServerDisplay_EffectivenessMessageMulti'
    expect(
      putIds(FLOW_INPUT, { file: FLOW, function: effectiveness, put: 'PutMsg SC_MSG_STD' }),
    ).toEqual([6, 3])
    expect(
      putIds(FLOW_INPUT, { file: FLOW, function: effectiveness, put: 'PutMsg SC_MSG_SET' }),
    ).toEqual([1])
  })

  it('gives the IDs of the set strings a handler sets up, by the string kind', () => {
    const source = { file: ITEMS, function: 'HandlerLeftoversUse', put: 'StrSetup set' } as const
    expect(putIds(FLOW_INPUT, source)).toEqual([2])
  })

  it('refuses a function that puts none, and a file the flow does not read', () => {
    const source = {
      file: FLOW,
      function: 'ServerDisplay_MoveFailed',
      put: 'PutMsg SC_MSG_SET',
    } as const
    expect(() => putIds(FLOW_INPUT, source)).toThrow('ServerDisplay_MoveFailed puts no SC_MSG_SET')
    expect(() => putIds(FLOW_INPUT, { ...source, file: 'src/battle/other.c' })).toThrow(
      'src/battle/other.c is no source of the flow',
    )
  })

  it('refuses a message ID that is no literal', () => {
    const named = {
      ...FLOW_INPUT,
      flowC: `${FLOW_INPUT.flowC}\nvoid Named(BtlServerFlow *flow) {\n    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, MSG_ID, SC_MSG_ARG_END);\n}\n`,
    }
    const source = { file: FLOW, function: 'Named', put: 'PutMsg SC_MSG_STD' } as const
    expect(() => putIds(named, source)).toThrow('Named puts the message "MSG_ID", no literal')
  })
})

// Scene: a pin that moves a line in its bank fails the generator by the line's label (D9).
describe('checkLineSources', () => {
  const text = textNumbers(TEXT_INPUT)

  it('passes when every label is what its function puts', () => {
    expect(() => {
      checkLineSources(FLOW_INPUT, text, GEN5_LINES)
    }).not.toThrow()
  })

  it('names a label its function does not put', () => {
    const moved: TextNumbers = {
      ...text,
      standard: { ...text.standard, Bank0019_Text_CriticalHit: 6 },
    }
    expect(() => {
      checkLineSources(FLOW_INPUT, moved, GEN5_LINES)
    }).toThrow('Bank0019_Text_CriticalHit is not what ServerDisplay_CriticalHitMessage puts')
  })

  it('names a set string put with the standard kind', () => {
    const moved: TextNumbers = {
      ...text,
      set: { ...text.set, Bank0018_Text_RestoredLittleHpUsing: 3 },
    }
    expect(() => {
      checkLineSources(FLOW_INPUT, moved, GEN5_LINES)
    }).toThrow('Bank0018_Text_RestoredLittleHpUsing is not what HandlerLeftoversUse puts')
  })

  it('names a label its bank lacks', () => {
    const lacking: TextNumbers = { ...text, set: {} }
    expect(() => {
      checkLineSources(FLOW_INPUT, lacking, GEN5_LINES)
    }).toThrow('the set bank has no Bank0018_Text_AvoidedAttack')
  })
})
