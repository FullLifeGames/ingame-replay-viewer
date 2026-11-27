// The numbers the server's flow puts as literals (#107, #108), from pokebw2 at its pin: the damage
// kinds of the hit flash, which ServerDisplay_Damage picks in an if chain and sends with
// SC_DAMAGE_PLURAL; the heal effect ServerControl_RecoverHPCore shows with SC_EFFECT_BY_POS; the
// recall effects ServerControl_SwitchOut and ServerControl_ForceSwitch pass on for SC_RECALL; and
// the flag ServerControl_FaintPokemon passes on for SC_FAINT_HP_GAUGE. pokebw2 has no name for
// any of them (BtlvCore_PlayDamageSE says the set has none yet), so the reader takes each from its
// function by shape, a passed one at the callee's parameter of its name, and throws on any other.
// The cross-check holds each of the backend's lines (src/gen5/backend/lines.ts) against the
// message IDs its function puts (D9). The errors name the function, the role and the shape the
// reader expected, never the C they met, so they show no number of pokebw2.
import type { Gen5Line } from '../src/gen5/backend/lines.ts'
import type { FlowNumbers, TextNumbers } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, enumAround, literal, stripComments } from './gen5-bw2-c.ts'

/** The server's flow and the item handlers, by role. */
export const FLOW_SOURCES = {
  flowC: 'src/battle/btl_server_flow.c',
  itemsC: 'src/battle/handler/item_handlers.c',
}

/** The texts of FLOW_SOURCES by role. */
export type FlowInput = Record<keyof typeof FLOW_SOURCES, string>

/** The body of the function `fn`, without comments and with its white space as single blanks. */
export const bodyText = (source: string, fn: string) =>
  stripComments(bodyOf(source, ` ${fn}(`))
    .replace(/\s+/g, ' ')
    .trim()

/** A literal of `fn`'s body, or a throw that names `fn` and the role alone. */
export function literalOf(text: string, fn: string, role: string): number {
  const value = literal(text)
  if (value === undefined) throw new Error(`${fn}: the ${role} is no number literal`)
  return value
}

const DAMAGE = 'ServerDisplay_Damage'
const KIND_CHAIN =
  /if \(superEffective\) \{ kind = ([^;]+); \} else if \(notVeryEffective\) \{ kind = ([^;]+); \} else \{ kind = ([^;]+); \}/

/** The kinds of the hit flash for a super effective, a resisted and any other hit. */
export function damageKinds(flowC: string): FlowNumbers['damageKinds'] {
  const body = bodyText(flowC, DAMAGE)
  const chain = KIND_CHAIN.exec(body)
  if (chain === null) {
    throw new Error(
      `${DAMAGE}: no chain if (superEffective) … else if (notVeryEffective) … else that sets kind`,
    )
  }
  const [, strong = '', weak = '', plain = ''] = chain
  if (body.match(/\bkind =/g)?.length !== 3)
    throw new Error(`${DAMAGE} sets kind outside its chain`)
  if (!/SC_DAMAGE_PLURAL,[^;]*\(u8\)kind\b/.test(body)) {
    throw new Error(`${DAMAGE} sends no SC_DAMAGE_PLURAL with the kind`)
  }
  return {
    super: literalOf(strong, DAMAGE, 'kind'),
    resisted: literalOf(weak, DAMAGE, 'kind'),
    plain: literalOf(plain, DAMAGE, 'kind'),
  }
}

const RECOVER = 'ServerControl_RecoverHPCore'

/** The effect a heal shows at the Pokémon's position. */
export function recoverEffect(flowC: string): number {
  const puts = [
    ...bodyText(flowC, RECOVER).matchAll(
      /BtlServerCmdQueue_Put\([^,]+, SC_EFFECT_BY_POS, [^,]+, ([^,)]+)\)/g,
    ),
  ]
  if (puts.length !== 1) {
    throw new Error(`${RECOVER} puts SC_EFFECT_BY_POS not exactly once`)
  }
  return literalOf(puts[0]?.[1]?.trim() ?? '', RECOVER, 'effect')
}

/** The index just past the parenthesis that closes the one at `open`, or the text's end. */
function closingParen(text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at++) {
    if (text[at] === '(') depth++
    else if (text[at] === ')' && --depth === 0) return at + 1
  }
  return text.length
}

/** A list of C arguments or parameters split at its top-level commas, each trimmed. */
function splitList(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < list.length; at++) {
    if (list[at] === '(') depth++
    else if (list[at] === ')') depth--
    else if (list[at] === ',' && depth === 0) {
      parts.push(list.slice(start, at).trim())
      start = at + 1
    }
  }
  return [...parts, list.slice(start).trim()]
}

/** Each place `fn` stands with its list in `text`: the list's parts, and the first character
 * after it (`{` for a definition). */
function listsOf(text: string, fn: string): { parts: string[]; next: string }[] {
  return [...text.matchAll(new RegExp(`(?<!\\w)${fn}\\(`, 'g'))].map(({ index }) => {
    const open = index + fn.length
    const close = closingParen(text, open)
    return {
      parts: splitList(text.slice(open + 1, close - 1)),
      next: text.slice(close).trim()[0] ?? '',
    }
  })
}

/** The names of the parameters of `fn`'s definition, in order. */
function paramsOf(source: string, fn: string): string[] {
  const definition = listsOf(stripComments(source), fn).find(({ next }) => next === '{')
  if (definition === undefined) throw new Error(`no definition of ${fn} in the source`)
  return definition.parts.map((part) => /(\w+)(\s*\[[^\]]*\])*$/.exec(part)?.[1] ?? '')
}

/** Where `fn`'s definition has the parameter `param`. */
function paramIndex(source: string, fn: string, param: string): number {
  const index = paramsOf(source, fn).indexOf(param)
  if (index < 0) throw new Error(`${fn} has no parameter ${param}`)
  return index
}

/** Each call of `callee` in `caller`'s body, its arguments by the names of the callee's
 * parameters, both functions defined in `source` (#109). */
export function callsOf(source: string, caller: string, callee: string): Record<string, string>[] {
  const params = paramsOf(source, callee)
  return listsOf(bodyText(source, caller), callee).map(({ parts }) =>
    Object.fromEntries(params.map((param, at) => [param, parts[at] ?? ''])),
  )
}

/** The literal `caller` passes to `callee` at the parameter `param`, which also names its role;
 * both functions are defined in `flowC`. */
export function passedLiteral(
  flowC: string,
  caller: string,
  callee: string,
  param: string,
): number {
  const calls = listsOf(bodyText(flowC, caller), callee)
  if (calls.length !== 1) throw new Error(`${caller} calls ${callee} not exactly once`)
  const index = paramIndex(flowC, callee, param)
  return literalOf(calls[0]?.parts[index] ?? '', caller, param)
}

/** The effects SC_RECALL shows as a Pokémon leaves: ServerControl_SwitchOut's for a switch, and
 * ServerControl_ForceSwitch's for a drag by Roar or Whirlwind. */
export const switchEffects = (flowC: string): FlowNumbers['switchEffects'] => ({
  switchOut: passedLiteral(
    flowC,
    'ServerControl_SwitchOut',
    'ServerControl_SwitchOutCore',
    'effect',
  ),
  drag: passedLiteral(
    flowC,
    'ServerControl_ForceSwitch',
    'ServerControl_ForceSwitchCore',
    'effect',
  ),
})

/** The flag of SC_FAINT_HP_GAUGE for a Pokémon that faints with HP left. */
export const faintGaugeFlag = (flowC: string): number =>
  passedLiteral(flowC, 'ServerControl_FaintPokemon', 'ServerDisplay_FaintPokemon', 'flag')

/** The damage kinds, the heal effect, the recall effects and the faint's flag. */
export const flowNumbers = (input: FlowInput): FlowNumbers => ({
  damageKinds: damageKinds(input.flowC),
  recoverEffect: recoverEffect(input.flowC),
  switchEffects: switchEffects(input.flowC),
  faintGaugeFlag: faintGaugeFlag(input.flowC),
})

/** The text of the source a line's C lives in. */
function sourceText(input: FlowInput, file: string): string {
  const role = (Object.keys(FLOW_SOURCES) as (keyof FlowInput)[]).find(
    (key) => FLOW_SOURCES[key] === file,
  )
  if (role === undefined) throw new Error(`${file} is no source of the flow`)
  return input[role]
}

/** Each message a body puts as [command or string kind, message]: `PutMsg` by its command, and a
 * handler's `StrSetup` by the string kind's name, a literal kind resolved through the kinds'
 * enum of the flow. */
function putsOf(body: string, flowC: string, put: Gen5Line['source']['put']): string[] {
  if (put !== 'StrSetup set') {
    const command = put.slice('PutMsg '.length)
    return [...body.matchAll(/BtlServerCmdQueue_PutMsg\([^,]+, (SC_MSG_\w+), ([^,)]+)/g)]
      .filter(([, sent]) => sent === command)
      .map(([, , message = '']) => message)
  }
  const kinds = enumAround(flowC, 'BTL_HANDLER_STRING_SET')
  return [...body.matchAll(/BattleHandler_StrSetup\([^,]+, ([^,]+), ([^,)]+)\)/g)]
    .filter(([, kind = '']) => (literal(kind) ?? kinds[kind]) === kinds.BTL_HANDLER_STRING_SET)
    .map(([, , message = '']) => message)
}

/** The literal message IDs a line's function puts the way its line goes out. */
export function putIds(input: FlowInput, source: Gen5Line['source']): number[] {
  const fn = source.function
  const messages = putsOf(bodyText(sourceText(input, source.file), fn), input.flowC, source.put)
  const what = source.put === 'StrSetup set' ? 'set string' : source.put.slice('PutMsg '.length)
  if (messages.length === 0) throw new Error(`${fn} puts no ${what}`)
  return messages.map((message) => literalOf(message, fn, `message of a ${what}`))
}

/** Throws by label when a line's label is missing from its bank or its index is none of the IDs
 * its function puts, so a pin that moves a line stops the generator (D9). */
export function checkLineSources(
  input: FlowInput,
  text: TextNumbers,
  lines: Readonly<Record<string, Gen5Line>>,
): void {
  for (const line of Object.values(lines)) {
    const id = text[line.bank][line.label]
    if (id === undefined) throw new Error(`the ${line.bank} bank has no ${line.label}`)
    if (!putIds(input, line.source).includes(id)) {
      throw new Error(`${line.label} is not what ${line.source.function} puts`)
    }
  }
}
