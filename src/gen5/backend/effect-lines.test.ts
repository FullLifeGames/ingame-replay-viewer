import { describe, expect, it } from 'vitest'

import type { TextNumbers } from '../bw2-numbers.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { lineId } from './lines.ts'

const FLOW = 'src/battle/btl_server_flow.c'
const ITEMS = 'src/battle/handler/item_handlers.c'
const MOVES = 'src/battle/handler/move_handlers.c'
const ABILITIES = 'src/battle/handler/ability_handlers.c'
const SIDE = 'src/battle/handler/side_handlers.c'
const CONDITIONS = 'src/battle/handler/condition_effects.c'

const SET = 'PutMsg SC_MSG_SET'
const STRING = 'StrSetup set'
const PICKED = 'message literal'

/** Each line by our name: its bank's label, and the file, function and put of its C. */
const EXPECTED: Record<string, [string, string, string, string]> = {
  burned: ['Bank0018_Text_Burned', CONDITIONS, 'GetConditionAddMessage', PICKED],
  paralyzed: ['Bank0018_Text_ParalyzedMayUnableMove', CONDITIONS, 'GetConditionAddMessage', PICKED],
  frozen: ['Bank0018_Text_FrozenSolid', CONDITIONS, 'GetConditionAddMessage', PICKED],
  fellAsleep: ['Bank0018_Text_FellAsleep', CONDITIONS, 'GetConditionAddMessage', PICKED],
  poisoned: ['Bank0018_Text_Poisoned', CONDITIONS, 'GetConditionAddMessage', PICKED],
  badlyPoisoned: ['Bank0018_Text_BadlyPoisoned', CONDITIONS, 'GetConditionAddMessage', PICKED],
  toxicOrb: ['Bank0018_Text_BadlyPoisonedBy', ITEMS, 'HandlerToxicOrb', STRING],
  hurtByPoison: ['Bank0018_Text_HurtByPoison', CONDITIONS, 'GetConditionDamageMessage', PICKED],
  hurtByBurn: ['Bank0018_Text_HurtByItsBurn', CONDITIONS, 'GetConditionDamageMessage', PICKED],
  wokeUp: ['Bank0018_Text_WokeUp', FLOW, 'ServerControl_CureStatus', SET],
  thawed: ['Bank0018_Text_ThawedOut', FLOW, 'ServerControl_CureStatus', SET],
  statusCured: ['Bank0018_Text_SStatusReturnedNormal', FLOW, 'ServerControl_CureStatus', SET],
  fastAsleep: ['Bank0018_Text_FastAsleep', FLOW, 'ServerDisplay_MoveFailMessage', SET],
  fullyParalyzed: ['Bank0018_Text_ParalyzedCantMove', FLOW, 'ServerDisplay_MoveFailMessage', SET],
  frozenSolid: ['Bank0018_Text_FrozenSolid_2', FLOW, 'ServerDisplay_MoveFailMessage', SET],
  flinched: ['Bank0018_Text_FlinchedCouldntMove', FLOW, 'ServerDisplay_MoveFailMessage', SET],
  statRose: ['Bank0018_Text_SAttackRose', FLOW, 'ServerDisplay_StatChange', SET],
  statFell: ['Bank0018_Text_SAttackFell', FLOW, 'ServerDisplay_StatChange', SET],
  statWontRise: ['Bank0018_Text_SAttackWontGo', FLOW, 'ServerDisplay_StatChangeLimit', SET],
  statWontFall: ['Bank0018_Text_SAttackWontGo_2', FLOW, 'ServerDisplay_StatChangeLimit', SET],
  sandHurts: ['Bank0018_Text_BuffetedBySandstorm', FLOW, 'ServerControl_WeatherDamage', STRING],
  hailHurts: ['Bank0018_Text_BuffetedByHail', FLOW, 'ServerControl_WeatherDamage', STRING],
  stealthRockSet: ['Bank0019_Text_PointedStonesFloatAir', MOVES, 'HandlerStealthRock', PICKED],
  stealthRockHit: ['Bank0018_Text_PointedStonesDugInto', SIDE, 'HandlerSideStealthRock', STRING],
  stealthRockEnd: [
    'Bank0019_Text_PointedStonesDisappearedFrom',
    FLOW,
    'ServerDisplay_SideEffectEnd',
    PICKED,
  ],
  sitrusBerry: ['Bank0018_Text_RestoredItsHealthUsing', ITEMS, 'HandlerSitrusBerryUse', STRING],
  custapBerry: ['Bank0018_Text_SLetMoveFirst', ITEMS, 'HandlerCustapBerryUse', STRING],
  lifeOrb: ['Bank0018_Text_LostSomeItsHp', ITEMS, 'HandlerLifeOrbReaction', STRING],
  airBalloon: ['Bank0018_Text_FloatsAirItsAir', ITEMS, 'HandlerAirBalloonMemberIn', STRING],
  airBalloonPopped: [
    'Bank0018_Text_SAirBalloonPopped',
    ITEMS,
    'HandlerAirBalloonDamageReaction',
    STRING,
  ],
  knockedOff: ['Bank0018_Text_KnockedOffS', MOVES, 'HandlerKnockOff', STRING],
  ironBarbs: ['Bank0018_Text_Hurt_2', ABILITIES, 'HandlerRoughSkin', STRING],
  protected: ['Bank0018_Text_ProtectedItself', MOVES, 'HandlerProtect', STRING],
  protectBlocked: [
    'Bank0018_Text_ProtectedItself_2',
    FLOW,
    'ServerControl_RemoveNoEffectTargets',
    SET,
  ],
  focusing: ['Bank0018_Text_TighteningItsFocus', MOVES, 'HandlerFocuspunch', STRING],
  drained: ['Bank0018_Text_HadItsEnergyDrained', FLOW, 'ServerControl_DamageDrain', PICKED],
  substitute: ['Bank0018_Text_PutSubstitute', FLOW, 'ServerControl_Substitute', SET],
  substituteHit: [
    'Bank0018_Text_SubstituteTookDamage',
    FLOW,
    'ServerControl_DamageSubstitute',
    PICKED,
  ],
  substituteFaded: [
    'Bank0018_Text_SSubstituteFaded',
    FLOW,
    'ServerControl_BreakSubstitute',
    PICKED,
  ],
  absorbedLight: ['Bank0018_Text_AbsorbedLight', MOVES, 'HandlerSolarBeamCharge', STRING],
}

// Scene: a status, a stat stage, a weather's damage, a hazard, an item, an ability and a move's
// effect each print the game's own line, put or picked by the server function or the handler the
// backend copies (#109), and so does Solar Beam's charge in sun (#110). The generator holds each
// label to that C.
describe('GEN5_EFFECT_LINES', () => {
  it('names each line by its label, its bank and the C that puts or picks it', () => {
    const bankOf = (label: string) => (label.startsWith('Bank0019_') ? 'standard' : 'set')
    const expected = Object.fromEntries(
      Object.entries(EXPECTED).map(([name, [label, file, fn, put]]) => [
        name,
        { bank: bankOf(label), label, source: { file, function: fn, put } },
      ]),
    )
    expect(GEN5_EFFECT_LINES).toEqual(expected)
  })

  it('labels each line from the bank it names', () => {
    const prefix = { standard: 'Bank0019_Text_', set: 'Bank0018_Text_' }
    const wrong = Object.entries(GEN5_EFFECT_LINES).filter(
      ([, line]) => !line.label.startsWith(prefix[line.bank]),
    )
    expect(wrong.map(([name]) => name)).toEqual([])
  })
})

// Scene: the backend sends an effect's line by the index its label has in the generated file.
describe('lineId on the effect lines', () => {
  // Invented: two banks with the labels at line indices of their own.
  const TEXT: TextNumbers = {
    standard: { Bank0019_Text_PointedStonesFloatAir: 5 },
    set: { Bank0018_Text_Burned: 12 },
  }

  it("finds a label's index in its bank", () => {
    expect(lineId(TEXT, GEN5_EFFECT_LINES.stealthRockSet)).toBe(5)
    expect(lineId(TEXT, GEN5_EFFECT_LINES.burned)).toBe(12)
  })

  it('names a label the bank lacks', () => {
    expect(() => lineId(TEXT, GEN5_EFFECT_LINES.stealthRockEnd)).toThrow(
      'bw2.json has no Bank0019_Text_PointedStonesDisappearedFrom',
    )
    expect(() => lineId(TEXT, GEN5_EFFECT_LINES.hurtByBurn)).toThrow(
      'bw2.json has no Bank0018_Text_HurtByItsBurn',
    )
  })
})
