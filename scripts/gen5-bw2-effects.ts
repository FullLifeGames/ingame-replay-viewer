// The numbers the effects' sequences need (#109, D16), from pokebw2 at its pin: the effects the
// server's flow shows as a condition starts or hurts, picked in a switch by condition; the values
// of a BattleCondition, built from the `common` struct of its union, the condition types and the
// turns of bad poison and of sleep (D6); the icon of bad poison; the turns of a weather that lasts
// (D5); the rule from a client to its side; sand's effects and where each goes out; the argument
// that hides the message window as the turn's end starts (D9); Focus Punch's effect; and the
// abilities whose handlers run as their Pokémon comes in (D4). pokebw2 has no name for these
// literals, so the reader takes each from its function by shape and throws on any other. The
// errors name the function, the role and the shape the reader expected, never the C they met, so
// they show no number of pokebw2. The literals held to their names' values are in
// gen5-bw2-effect-literals.ts.
import type { EffectNumbers } from '../src/gen5/bw2-flow-numbers.ts'
import {
  bodyOf,
  closingBrace,
  defineValue,
  enumAround,
  literal,
  literalsIn,
  stripComments,
} from './gen5-bw2-c.ts'
import { bodyText, callsOf, literalOf, passedLiteral } from './gen5-bw2-flow.ts'
import { memberLayout } from './gen5-bw2-struct.ts'

/** The files the reader parses beside five the generator reads already, by role. */
export const EFFECT_SOURCES = {
  calcC: 'src/battle/btl_calc.c',
  posH: 'include/battle/select/btl_pospoke.h',
}

/** The texts of EFFECT_SOURCES by role, with the flow (`flowC`), the ability and move handlers
 * (`abilitiesC`, `movesC`), btl_main.c (`mainC`) and btl_pokeparam.h (`pokeparamH`) under the
 * generator's roles. */
export type EffectInput = Record<
  keyof typeof EFFECT_SOURCES | 'flowC' | 'abilitiesC' | 'movesC' | 'mainC' | 'pokeparamH',
  string
>

/** The one number literal of the branch `case caseName:` in `fn`'s body, up to its `break`. */
export function caseLiteral(source: string, fn: string, caseName: string): number {
  const branches = bodyText(source, fn).split(`case ${caseName}:`)
  if (branches.length === 1) throw new Error(`${fn} has no case ${caseName}`)
  if (branches.length !== 2) throw new Error(`${fn} names case ${caseName} not exactly once`)
  const branch = (branches[1] ?? '').split('break;')[0] ?? ''
  const [found, ...more] = literalsIn(branch)
  if (found === undefined || more.length > 0) {
    throw new Error(`${fn}: the effect of case ${caseName} is not one literal`)
  }
  return literalOf(found, fn, `effect of case ${caseName}`)
}

const cases = (source: string, fn: string, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, caseLiteral(source, fn, name)]))

const MAJOR = ['SLEEP', 'POISON', 'BURN', 'PARALYSIS', 'FREEZE'].map((name) => `CONDITION_${name}`)
const HURTING = ['CONDITION_POISON', 'CONDITION_BURN']

/** The members of the struct `common` in the union of struct BattleCondition. */
function commonBody(pokeparamH: string): string {
  const code = stripComments(pokeparamH)
  const head = /\bstruct\s+BattleCondition\s*\{/.exec(code)
  if (head === null) throw new Error('no struct BattleCondition in the source')
  const open = head.index + head[0].length - 1
  const body = code.slice(open + 1, closingBrace(code, open) - 1)
  const common = /\bstruct\s*\{([^{}]*)\}\s*common\s*;/.exec(body)
  if (common === null) throw new Error('struct BattleCondition has no struct member common')
  return common[1] ?? ''
}

/** The maker of a BattleCondition of a type and turns, as `common` lays them out; it names the
 * role of a value that does not fit. */
function conditionOf(pokeparamH: string) {
  const { fields } = memberLayout(pokeparamH, commonBody(pokeparamH))
  const shift = (name: string, value: number, role: string) => {
    const field = fields[name]
    if (field?.bit === undefined || field.bits === undefined) {
      throw new Error(`BattleCondition: common.${name} is no bit-field`)
    }
    if (value >= 2 ** field.bits) {
      throw new Error(`BattleCondition: common.${name} is too narrow for ${role}`)
    }
    return value * 2 ** (field.offset * 8 + field.bit)
  }
  return (type: number, turns: number, role: string) =>
    shift('type', type, role) + shift('turns', turns, role)
}

/** The values SC_OP_SET_CONDITION carries for a status for good, for bad poison
 * (MakeConditionBadlyPoisoned) and for sleep at the most turns BtlCalc_MakeStatusCondition
 * draws. */
export function conditionValues(input: EffectInput): EffectNumbers['conditionValues'] {
  const types = enumAround(input.pokeparamH, 'BTL_CONDITION_TYPE_NONE')
  const type = (name: string) => {
    const value = types[`BTL_CONDITION_TYPE_${name}`]
    if (value === undefined) throw new Error(`no condition type BTL_CONDITION_TYPE_${name}`)
    return value
  }
  const bad = defineValue(input.pokeparamH, 'BTL_CONDITION_BADLY_POISONED_TURNS')
  const sleep = passedLiteral(
    input.calcC,
    'BtlCalc_MakeStatusCondition',
    'BtlCalc_RandomRange',
    'max',
  )
  const condition = conditionOf(input.pokeparamH)
  return {
    permanent: condition(type('PERMANENT'), 0, 'a status for good'),
    badlyPoisoned: condition(type('PERMANENT'), bad, 'bad poison'),
    sleep: condition(type('TURNS'), sleep, 'sleep'),
  }
}

/** One match of `pattern` in `fn`'s body, its first group a literal of the role `role`. */
export function oneLiteral(source: string, fn: string, pattern: RegExp, role: string): number {
  const found = [...bodyText(source, fn).matchAll(pattern)]
  if (found.length !== 1) throw new Error(`${fn}: no one ${role}`)
  return literalOf(found[0]?.[1] ?? '', fn, role)
}

/** CONDITION_POISON plus the offset ServerDisplay_AddCondition gives bad poison's icon. */
const badlyPoisonedGauge = (flowC: string, poison: number) =>
  poison +
  oneLiteral(
    flowC,
    'ServerDisplay_AddCondition',
    /\bcondition = CONDITION_POISON \+ ([^;]+);/g,
    'offset of bad poison',
  )

/** The turns BtlServerFlow_StartBattle gives the battle's own weather, which lasts. */
export const weatherTurns = (flowC: string): number =>
  passedLiteral(flowC, 'BtlServerFlow_StartBattle', 'ServerControl_ChangeWeather', 'turns')

/** The mask of GetClientSide's `return clientId & <literal>;`. */
export function sideMask(mainC: string): number {
  const shape = /^return clientId & ([^;]+);$/.exec(bodyText(mainC, 'GetClientSide'))
  if (shape === null) throw new Error('GetClientSide: no return clientId & <literal>')
  return literalOf(shape[1] ?? '', 'GetClientSide', 'mask')
}

const VIEW = 'ServerControl_ViewEffect'

/** True when a position argument is BTL_POS_NONE, by name or by its value. */
const isNone = (arg: string | undefined, none: number) =>
  arg === 'BTL_POS_NONE' || literal(arg ?? '') === none

/** The effect of a call of ServerControl_ViewEffect that goes out at one position (`placed`) or
 * at none, or a throw that names `role`. */
function viewedEffect(call: Record<string, string>, fn: string, none: number, role: string) {
  const placed = role === 'hit'
  if (isNone(call.pos1, none) === placed || !isNone(call.pos2, none)) {
    const where = placed ? 'no effect at one position' : 'an effect at a position'
    throw new Error(`${fn}: the ${role} is ${where}`)
  }
  return literalOf(call.effect ?? '', fn, 'effect')
}

/** Sand's and hail's effects (ServerControl_ViewEffect): ServerControl_WeatherDamage's first at
 * the Pokémon it hurts, and ServerControl_TurnCheckWeather's one over the field after the hits.
 * WeatherDamage's second call shows the same over the field before a hit that faints. */
export function sandEffects(flowC: string, posH: string): EffectNumbers['sandEffects'] {
  const none = defineValue(posH, 'BTL_POS_NONE')
  const [damage, check] = ['ServerControl_WeatherDamage', 'ServerControl_TurnCheckWeather']
  const hits = callsOf(flowC, damage, VIEW)
  if (hits.length !== 2) throw new Error(`${damage} calls ${VIEW} not exactly twice`)
  const after = callsOf(flowC, check, VIEW)
  if (after.length !== 1) throw new Error(`${check} calls ${VIEW} not exactly once`)
  return {
    hit: viewedEffect(hits[0] ?? {}, damage, none, 'hit'),
    after: viewedEffect(after[0] ?? {}, check, none, 'effect after the hits'),
  }
}

const ADD_ENTRY = /^\{ (ABILITY_\w+), (EventAdd\w+) \}$/

/** The abilities of sAbilityEventAddTable whose adder returns a handler table that holds
 * BTL_EVENT_MEMBER_IN, in the table's order. */
export function memberInAbilities(abilitiesC: string): string[] {
  const code = stripComments(abilitiesC)
  const head = /\bsAbilityEventAddTable\[\]\s*=\s*\{/.exec(code)
  if (head === null) throw new Error('no table sAbilityEventAddTable[] = { ... } in the source')
  const open = head.index + head[0].length - 1
  const entries = code
    .slice(open + 1, closingBrace(code, open) - 1)
    .split(/(?<=\}),/)
    .map((entry) => entry.trim().replace(/\s+/g, ' '))
    .filter((entry) => entry !== '')
  return entries
    .map((entry) => {
      const match = ADD_ENTRY.exec(entry)
      if (match === null) {
        throw new Error('sAbilityEventAddTable: an entry is no { ABILITY_*, EventAdd* }')
      }
      return { ability: match[1] ?? '', adder: match[2] ?? '' }
    })
    .filter(({ adder }) => handlersOf(code, adder).includes('BTL_EVENT_MEMBER_IN'))
    .map(({ ability }) => ability)
}

/** The events of the handler table the adder `adder` returns. */
function handlersOf(code: string, adder: string): string[] {
  // An adder returns a pointer, so its definition reads `*EventAdd...(`, not ` EventAdd...(`.
  const body = bodyOf(code, `*${adder}(`).replace(/\s+/g, ' ').trim()
  const table = /^\*priority = [^;]+; return (s\w+);$/.exec(body)
  if (table?.[1] === undefined) {
    throw new Error(`${adder} returns no handler table by name`)
  }
  const head = new RegExp(`\\b${table[1]}\\[\\]\\s*=\\s*\\{`).exec(code)
  if (head === null) throw new Error(`no handler table ${table[1]}`)
  const open = head.index + head[0].length - 1
  const entries = code.slice(open + 1, closingBrace(code, open) - 1)
  return [...entries.matchAll(/\{\s*(\w+)\s*,/g)].map(([, event = '']) => event)
}

/** Every effect number, the gauge of bad poison from the battle's constants. */
export const effectNumbers = (
  input: EffectInput,
  constants: Readonly<Record<string, number>>,
): EffectNumbers => ({
  addEffects: cases(input.flowC, 'ServerControl_AddCondition', MAJOR),
  damageEffects: cases(input.flowC, 'ServerControl_ConditionDamage', HURTING),
  conditionValues: conditionValues(input),
  badlyPoisonedGauge: badlyPoisonedGauge(input.flowC, constantOf(constants, 'CONDITION_POISON')),
  weatherTurns: weatherTurns(input.flowC),
  sideMask: sideMask(input.mainC),
  sandEffects: sandEffects(input.flowC, input.posH),
  hideWindow: oneLiteral(
    input.flowC,
    'ServerControl_TurnCheck',
    /BtlServerCmdQueue_Put\([^,]+, SC_HIDE_MSG_WINDOW, ([^,)]+)\)/g,
    'argument of SC_HIDE_MSG_WINDOW',
  ),
  focusEffect: oneLiteral(
    input.movesC,
    'HandlerFocuspunch',
    /\beffect->effect = ([^;]+);/g,
    'effect',
  ),
  memberInAbilities: memberInAbilities(input.abilitiesC),
})

function constantOf(constants: Readonly<Record<string, number>>, name: string): number {
  const value = constants[name]
  if (value === undefined) throw new Error(`the battle's constants lack ${name}`)
  return value
}
