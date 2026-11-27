import { describe, expect, it } from 'vitest'

import {
  chargeRelease,
  damageKinds,
  faintGaugeFlag,
  flowNumbers,
  recoverEffect,
  switchEffects,
} from './gen5-bw2-flow'
import { FLOW_INPUT } from './gen5-bw2-flow.fixtures'

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
      new Error(
        'ServerDisplay_Damage: no chain if (superEffective) … else if (notVeryEffective) … else that sets kind',
      ),
    )
  })

  // The error names the role alone, never the C it met: a sum shows no number.
  it('refuses a kind that is no literal', () => {
    const named = damage(
      '    if (superEffective) { kind = KIND_A + 3; } else if (notVeryEffective) { kind = 4; }' +
        ' else { kind = 5; }',
    )
    expect(() => damageKinds(named)).toThrow(
      new Error('ServerDisplay_Damage: the kind is no number literal'),
    )
  })

  it('refuses a kind set again after the chain', () => {
    const again = damage(
      '    if (superEffective) { kind = 7; } else if (notVeryEffective) { kind = 4; }' +
        ' else { kind = 5; }\n    kind = 9;',
    )
    expect(() => damageKinds(again)).toThrow(
      new Error('ServerDisplay_Damage sets kind outside its chain'),
    )
  })

  it('refuses a body that sends no SC_DAMAGE_PLURAL with the kind', () => {
    const chain =
      '    if (superEffective) { kind = 7; } else if (notVeryEffective) { kind = 4; } else { kind = 5; }'
    const without = damage(chain).replace('(u8)kind', '(u8)count')
    expect(() => damageKinds(without)).toThrow(
      new Error('ServerDisplay_Damage sends no SC_DAMAGE_PLURAL with the kind'),
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
      new Error('ServerControl_RecoverHPCore: the effect is no number literal'),
    )
    expect(() => recoverEffect(body(`${put('1')}\n${put('2')}`))).toThrow(
      new Error('ServerControl_RecoverHPCore puts SC_EFFECT_BY_POS not exactly once'),
    )
  })
})

// Invented: the two callees with their parameters in an order of their own, and the callers with
// the given lines inside.
const CALLEES =
  'void ServerControl_SwitchOutCore(BtlServerFlow *flow, u32 effect, BattleMon *mon) {\n}\n' +
  'BOOL ServerControl_ForceSwitchCore(BtlServerFlow *flow, BattleMon *target, u16 effect) {\n' +
  '    return TRUE;\n}\n'
const switching = (switchOut: string, force: string) =>
  `${CALLEES}BOOL ServerControl_SwitchOut(BtlServerFlow *flow, BattleMon *mon) {\n${switchOut}\n` +
  `    return TRUE;\n}\nvoid ServerControl_ForceSwitch(BtlServerFlow *flow, BattleMon *mon) {\n` +
  `${force}\n}\n`
const OUT = '    ServerControl_SwitchOutCore(flow, 0x21, mon);'
const FORCE = '    if (ServerControl_ForceSwitchCore(flow, GetTarget(flow, mon), 0x23)) {\n    }'

// Scene: a Pokémon that leaves shows the recall effect the server passes on: a switch's, or a
// drag's by Roar or Whirlwind.
describe('switchEffects', () => {
  it("reads each effect at the callee's parameter of that name", () => {
    expect(flowNumbers(FLOW_INPUT).switchEffects).toEqual({ switchOut: 0x6e5, drag: 0x6eb })
    expect(switchEffects(switching(OUT, FORCE))).toEqual({ switchOut: 0x21, drag: 0x23 })
  })

  it('refuses a second call', () => {
    expect(() => switchEffects(switching(`${OUT}\n${OUT}`, FORCE))).toThrow(
      new Error('ServerControl_SwitchOut calls ServerControl_SwitchOutCore not exactly once'),
    )
  })

  it('refuses a missing call', () => {
    expect(() => switchEffects(switching(OUT, '    flow->result = 0;'))).toThrow(
      new Error('ServerControl_ForceSwitch calls ServerControl_ForceSwitchCore not exactly once'),
    )
  })

  // The error names the role alone, never the C it met.
  it('refuses an effect that is no literal', () => {
    expect(() => switchEffects(switching(OUT, FORCE.replace('0x23', 'EFFECT_A + 3')))).toThrow(
      new Error('ServerControl_ForceSwitch: the effect is no number literal'),
    )
  })

  it('refuses a callee without the parameter, and one without a definition', () => {
    const renamed = switching(OUT, FORCE).replace('u32 effect', 'u32 look')
    expect(() => switchEffects(renamed)).toThrow(
      new Error('ServerControl_SwitchOutCore has no parameter effect'),
    )
    const withoutCore = switching(OUT, FORCE).replace(
      /^BOOL ServerControl_ForceSwitchCore[^}]*}\n/m,
      '',
    )
    expect(() => switchEffects(withoutCore)).toThrow(
      new Error('no definition of ServerControl_ForceSwitchCore in the source'),
    )
  })
})

// Invented: the faint's display with its flag between other parameters, and its caller.
const fainting = (calls: string) =>
  'void ServerDisplay_FaintPokemon(BtlServerFlow *flow, u32 flag, BattleMon *mon) {\n}\n' +
  `void ServerControl_FaintPokemon(BtlServerFlow *flow, BattleMon *mon) {\n${calls}\n}\n`
const FAINT = '    ServerDisplay_FaintPokemon(flow, 4, mon);'

// Scene: a Pokémon that faints with HP left has its bar emptied with the flag the server passes.
describe('faintGaugeFlag', () => {
  it("reads the flag at the callee's parameter of that name", () => {
    expect(flowNumbers(FLOW_INPUT).faintGaugeFlag).toBe(2)
    expect(faintGaugeFlag(fainting(FAINT))).toBe(4)
  })

  it('refuses a second call and a missing call', () => {
    const error = new Error(
      'ServerControl_FaintPokemon calls ServerDisplay_FaintPokemon not exactly once',
    )
    expect(() => faintGaugeFlag(fainting(`${FAINT}\n${FAINT}`))).toThrow(error)
    expect(() => faintGaugeFlag(fainting('    HPZero(mon);'))).toThrow(error)
  })

  it('refuses a flag that is no literal', () => {
    expect(() => faintGaugeFlag(fainting(FAINT.replace('4', 'FALSE')))).toThrow(
      new Error('ServerControl_FaintPokemon: the flag is no number literal'),
    )
  })
})

// Invented: the charge check with the given lines where the release sets the move's effect.
const charging = (release: string) =>
  'u32 ServerControl_CheckChargeTurn(BtlServerFlow *flow, u16 move, BattleMon *mon) {\n' +
  '    if (!ServerEvent_CheckChargeSkip(flow, mon, move)) {\n' +
  `        return BTL_CHARGE_TURN_USED;\n    }\n${release}\n` +
  '    return ServerEvent_ChargeRelease(flow, mon, move) ? BTL_CHARGE_RELEASED : 0;\n}\n'
const RELEASE = '    flow->moveEffect->index = 9;'

// Scene: Solar Beam in sun charges and fires in one turn; the release's look is the move
// animation with the index the server sets for it (#110).
describe('chargeRelease', () => {
  it('reads the literal the charge check sets as the move effect index', () => {
    expect(flowNumbers(FLOW_INPUT).chargeRelease).toBe(0x13)
    expect(chargeRelease(charging(RELEASE))).toBe(9)
  })

  it('refuses a missing and a second assignment', () => {
    const error = new Error(
      'ServerControl_CheckChargeTurn sets the release index (moveEffect->index = …;) not exactly once',
    )
    expect(() => chargeRelease(charging('    flow->result = 0;'))).toThrow(error)
    expect(() => chargeRelease(charging(`${RELEASE}\n${RELEASE}`))).toThrow(error)
  })

  // The error names the role alone, never the C it met.
  it('refuses an index that is no literal', () => {
    expect(() => chargeRelease(charging(RELEASE.replace('9', 'MOVE_EFFECT_RELEASE')))).toThrow(
      new Error('ServerControl_CheckChargeTurn: the release index is no number literal'),
    )
  })
})
