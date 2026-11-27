// The literals of pokebw2's flow and handlers that stand where a name or a generated number stands
// elsewhere (#109), each read at its call by shape and held to its name's value: ITEM_NONE, the
// turn's end's SC_HIDE_MSG_WINDOW argument, BTL_POS_NONE, CONDITION_NONE, and each condition's
// effect as it starts. The errors name the function and the role, never the C they met, so they
// show no number of pokebw2.
import { defineValue, literal } from './gen5-bw2-c.ts'
import { type EffectInput, oneLiteral } from './gen5-bw2-effects.ts'
import { bodyText, literalOf, passedLiteral } from './gen5-bw2-flow.ts'

/** The conditions whose stopped move plays an effect in ServerControl_MoveFail. */
export const CANT_CONDITIONS = [
  'CONDITION_SLEEP',
  'CONDITION_PARALYSIS',
  'CONDITION_FREEZE',
] as const

type CantCondition = (typeof CANT_CONDITIONS)[number]

const HIDE = /BtlServerCmdQueue_Put\([^,]+, SC_HIDE_MSG_WINDOW, ([^,)]+)\)/g
const GAUGE = /BtlServerCmdQueue_Put\([^,]+, SC_SET_GAUGE_STATUS, [^,]+, ([^,)]+)\)/g
const EFFECT_AT = /\bServerDisplay_AddEffectAtPosition\([^,]+, [^,]+, ([^,)]+)\)/g
const FAIL = 'ServerControl_MoveFail'

/** The branch of the switch in `fn`'s body whose `case` label has the value `value`, up to its
 * `break;`. */
function caseOfValue(source: string, fn: string, value: number, role: string): string {
  const found = bodyText(source, fn)
    .split(/\bcase /)
    .slice(1)
    .filter((branch) => literal(branch.slice(0, branch.indexOf(':'))) === value)
  if (found.length !== 1) throw new Error(`${fn}: no one case for the ${role}`)
  return (found[0] ?? '').split('break;')[0] ?? ''
}

/** The effect ServerControl_MoveFail plays for the cause ServerControl_CheckMoveFail gives a move
 * that `condition` stops. */
function cantEffect(flowC: string, condition: CantCondition): number {
  const role = `cause of ${condition}`
  const causeAt = new RegExp(`\\bstatus == ${condition}\\b[^{}]*\\{ cause = ([^;]+);`, 'g')
  const cause = oneLiteral(flowC, 'ServerControl_CheckMoveFail', causeAt, role)
  const branch = caseOfValue(flowC, FAIL, cause, role)
  const effects = [...branch.matchAll(EFFECT_AT)]
  if (effects.length !== 1) throw new Error(`${FAIL}: no one effect for the ${role}`)
  return literalOf(effects[0]?.[1] ?? '', FAIL, `effect for the ${role}`)
}

/** The literals that stand where a name or a generated number stands elsewhere, each read at its
 * call: the item HandlerKnockOff leaves and the one ServerControl_UseHeldItem passes to
 * ServerControl_ChangeHeldItem (ITEM_NONE), BattleHandler_EffectAtPos' SC_HIDE_MSG_WINDOW
 * argument, HandlerFocuspunch's second position (BTL_POS_NONE), the icon ServerControl_CureStatus
 * and ServerControl_CureCondition clear to (CONDITION_NONE), and the effect ServerControl_MoveFail
 * plays for a move that sleep, paralysis or freeze stops (ServerControl_AddCondition's). */
export const effectLiterals = (input: Pick<EffectInput, 'flowC' | 'movesC'>) => ({
  knockOffItem: oneLiteral(
    input.movesC,
    'HandlerKnockOff',
    /\bparam->item = ([^;]+);/g,
    'item it leaves',
  ),
  usedItem: passedLiteral(
    input.flowC,
    'ServerControl_UseHeldItem',
    'ServerControl_ChangeHeldItem',
    'item',
  ),
  effectAtPosHide: oneLiteral(
    input.flowC,
    'BattleHandler_EffectAtPos',
    HIDE,
    'argument of SC_HIDE_MSG_WINDOW',
  ),
  focusPunchPos: oneLiteral(
    input.movesC,
    'HandlerFocuspunch',
    /\beffect->pos2 = ([^;]+);/g,
    'second position',
  ),
  cureStatusIcon: oneLiteral(input.flowC, 'ServerControl_CureStatus', GAUGE, 'icon it clears to'),
  cureConditionIcon: oneLiteral(
    input.flowC,
    'ServerControl_CureCondition',
    GAUGE,
    'icon it clears to',
  ),
  cantEffects: Object.fromEntries(
    CANT_CONDITIONS.map((condition) => [condition, cantEffect(input.flowC, condition)]),
  ) as Record<CantCondition, number>,
})

/** The names' values the literals are held to: the generated items, the battle's constants, the
 * turn's end's SC_HIDE_MSG_WINDOW argument and each condition's effect as it starts. */
export interface LiteralNames {
  readonly items: Readonly<Record<string, number>>
  readonly constants: Readonly<Record<string, number>>
  readonly hideWindow: number
  readonly addEffects: Readonly<Record<string, number>>
}

function named(record: Readonly<Record<string, number>>, name: string, what: string): number {
  const value = record[name]
  if (value === undefined) throw new Error(`${what} lack ${name}`)
  return value
}

/** Each literal of `read` beside the value of its name, with the error that names a mismatch. */
function literalPairs(
  read: ReturnType<typeof effectLiterals>,
  names: LiteralNames,
  posNone: number,
): [string, number, number][] {
  const itemNone = named(names.items, 'ITEM_NONE', 'the generated items')
  const conditionNone = named(names.constants, 'CONDITION_NONE', "the battle's constants")
  const icon = 'the icon it clears to is not CONDITION_NONE'
  return [
    ['HandlerKnockOff: the item it leaves is not ITEM_NONE', read.knockOffItem, itemNone],
    ['ServerControl_UseHeldItem: the item it passes is not ITEM_NONE', read.usedItem, itemNone],
    [
      "BattleHandler_EffectAtPos: SC_HIDE_MSG_WINDOW's argument is not ServerControl_TurnCheck's",
      read.effectAtPosHide,
      names.hideWindow,
    ],
    ['HandlerFocuspunch: the second position is not BTL_POS_NONE', read.focusPunchPos, posNone],
    [`ServerControl_CureStatus: ${icon}`, read.cureStatusIcon, conditionNone],
    [`ServerControl_CureCondition: ${icon}`, read.cureConditionIcon, conditionNone],
    ...CANT_CONDITIONS.map((condition): [string, number, number] => [
      `${FAIL}: the effect for ${condition} is not ServerControl_AddCondition's`,
      read.cantEffects[condition],
      named(names.addEffects, condition, 'the effects as a condition starts'),
    ]),
  ]
}

/** Throws by function and role where a literal of `effectLiterals` differs from its name's value.
 * The errors show no number. */
export function checkEffectLiterals(
  input: Pick<EffectInput, 'flowC' | 'movesC' | 'posH'>,
  names: LiteralNames,
): void {
  const pairs = literalPairs(effectLiterals(input), names, defineValue(input.posH, 'BTL_POS_NONE'))
  const wrong = pairs.find(([, value, expected]) => value !== expected)
  if (wrong !== undefined) throw new Error(wrong[0])
}
