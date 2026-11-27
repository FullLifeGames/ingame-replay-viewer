import { describe, expect, it } from 'vitest'

import type { TextNumbers } from '../src/gen5/bw2-numbers'
import { GEN5_EFFECT_LINES } from '../src/gen5/backend/effect-lines'
import { GEN5_LINES } from '../src/gen5/backend/lines'
import { FLOW_INPUT } from './gen5-bw2-flow.fixtures'
import { checkBackendLines, checkLineSources, LINE_TABLES, putIds } from './gen5-bw2-lines'
import { TEXT_INPUT } from './gen5-bw2-text.fixtures'
import { textNumbers } from './gen5-bw2-text'

const FLOW = 'src/battle/btl_server_flow.c'
const ITEMS = 'src/battle/handler/item_handlers.c'
const CONDITIONS = 'src/battle/handler/condition_effects.c'

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
    expect(() => putIds(FLOW_INPUT, source)).toThrow(
      new Error('ServerDisplay_MoveFailed puts no SC_MSG_SET'),
    )
    expect(() => putIds(FLOW_INPUT, { ...source, file: 'src/battle/other.c' })).toThrow(
      new Error('src/battle/other.c is no source of the flow'),
    )
  })

  it('refuses a message ID that is no literal', () => {
    const named = {
      ...FLOW_INPUT,
      flowC: `${FLOW_INPUT.flowC}\nvoid Named(BtlServerFlow *flow) {\n    BtlServerCmdQueue_PutMsg(flow->queue, SC_MSG_STD, MSG_ID, SC_MSG_ARG_END);\n}\n`,
    }
    const source = { file: FLOW, function: 'Named', put: 'PutMsg SC_MSG_STD' } as const
    expect(() => putIds(named, source)).toThrow(
      new Error('Named: the message of a SC_MSG_STD is no number literal'),
    )
  })
})

// Scene: a status, a side's line or a substitute's hit picks its message by a switch or passes it
// to the function that puts it, so the cross-check takes every number literal of the picker (#109).
describe('putIds of a picker', () => {
  it('gives every number literal of the function that picks a message', () => {
    const source = {
      file: CONDITIONS,
      function: 'GetConditionDamageMessage',
      put: 'message literal',
    } as const
    expect(putIds(FLOW_INPUT, source)).toEqual([10, 2, 49, 1])
  })

  it('takes a literal the picker passes on to the function that puts it', () => {
    const drain = 'ServerControl_DamageDrain'
    const source = { file: FLOW, function: drain, put: 'message literal' } as const
    expect(putIds(FLOW_INPUT, source)).toEqual([29])
  })

  it('refuses a picker with no number literal', () => {
    const named = {
      ...FLOW_INPUT,
      flowC: `${FLOW_INPUT.flowC}\nvoid Named(BtlServerFlow *flow) {\n    Pick(flow, MSG_ID);\n}\n`,
    }
    const source = { file: FLOW, function: 'Named', put: 'message literal' } as const
    expect(() => putIds(named, source)).toThrow(new Error('Named puts no message literal'))
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
    }).toThrow(
      new Error('Bank0019_Text_CriticalHit is not what ServerDisplay_CriticalHitMessage puts'),
    )
  })

  it('names a set string put with the standard kind', () => {
    const moved: TextNumbers = {
      ...text,
      set: { ...text.set, Bank0018_Text_RestoredLittleHpUsing: 3 },
    }
    expect(() => {
      checkLineSources(FLOW_INPUT, moved, GEN5_LINES)
    }).toThrow(
      new Error('Bank0018_Text_RestoredLittleHpUsing is not what HandlerLeftoversUse puts'),
    )
  })

  it('names a label its bank lacks', () => {
    const lacking: TextNumbers = { ...text, set: {} }
    expect(() => {
      checkLineSources(FLOW_INPUT, lacking, GEN5_LINES)
    }).toThrow(new Error('the set bank has no Bank0018_Text_AvoidedAttack'))
  })
})

// Scene: a status, a side's line or a substitute's hit sends the line its picker holds; a pin that
// moves one fails the generator by its label and the picker's name (#109).
describe('checkLineSources on the effect lines', () => {
  const text = textNumbers(TEXT_INPUT)

  it('passes when every label is what its function puts or picks', () => {
    expect(() => {
      checkLineSources(FLOW_INPUT, text, GEN5_EFFECT_LINES)
    }).not.toThrow()
  })

  it("names a picker without the label's ID", () => {
    const moved: TextNumbers = { ...text, set: { ...text.set, Bank0018_Text_Burned: 8 } }
    expect(() => {
      checkLineSources(FLOW_INPUT, moved, GEN5_EFFECT_LINES)
    }).toThrow(new Error('Bank0018_Text_Burned is not what GetConditionAddMessage puts'))
  })

  it('names a standard line its picker lacks', () => {
    const moved: TextNumbers = {
      ...text,
      standard: { ...text.standard, Bank0019_Text_PointedStonesFloatAir: 7 },
    }
    expect(() => {
      checkLineSources(FLOW_INPUT, moved, GEN5_EFFECT_LINES)
    }).toThrow(new Error('Bank0019_Text_PointedStonesFloatAir is not what HandlerStealthRock puts'))
  })
})

// Scene: the generator holds both of the backend's tables to the C, the lines of hits, faints and
// drags and the lines of the effects.
describe('checkBackendLines', () => {
  const text = textNumbers(TEXT_INPUT)

  it('holds the lines and the effect lines', () => {
    expect(LINE_TABLES).toEqual({ lines: GEN5_LINES, 'effect lines': GEN5_EFFECT_LINES })
    expect(() => {
      checkBackendLines(FLOW_INPUT, text)
    }).not.toThrow()
  })

  it('names a label of the effect lines its bank lacks', () => {
    const set = Object.fromEntries(
      Object.entries(text.set).filter(([label]) => label !== 'Bank0018_Text_SSubstituteFaded'),
    )
    expect(() => {
      checkBackendLines(FLOW_INPUT, { ...text, set })
    }).toThrow(new Error('the set bank has no Bank0018_Text_SSubstituteFaded'))
  })
})
