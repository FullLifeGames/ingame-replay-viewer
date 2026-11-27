// The cross-check of the backend's lines (src/gen5/backend/lines.ts, #107, D9): each line's label
// is held against the message IDs its function puts in pokebw2 at its pin, so a pin that moves a
// line stops the generator by the line's label. The C files a line can live in are the roles of
// FLOW_SOURCES. The errors name the label, the function and the put, never the C they met, so they
// show no number of pokebw2.
import { GEN5_EFFECT_LINES } from '../src/gen5/backend/effect-lines.ts'
import { type Gen5Line, GEN5_LINES } from '../src/gen5/backend/lines.ts'
import type { TextNumbers } from '../src/gen5/bw2-numbers.ts'
import { enumAround, literal, literalsIn } from './gen5-bw2-c.ts'
import { bodyText, FLOW_SOURCES, type FlowInput, literalOf } from './gen5-bw2-flow.ts'

/** The text of the source a line's C lives in. */
function sourceText(input: FlowInput, file: string): string {
  const role = (Object.keys(FLOW_SOURCES) as (keyof FlowInput)[]).find(
    (key) => FLOW_SOURCES[key] === file,
  )
  if (role === undefined) throw new Error(`${file} is no source of the flow`)
  return input[role]
}

type Put = Gen5Line['source']['put']

/** Each message a body puts as [command or string kind, message]: `PutMsg` by its command, and a
 * handler's `StrSetup` by the string kind's name, a literal kind resolved through the kinds'
 * enum of the flow. */
function putsOf(body: string, flowC: string, put: Exclude<Put, 'message literal'>): string[] {
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

/** How a put names itself in an error. */
const putName = (put: Put) => (put === 'StrSetup set' ? 'set string' : put.replace(/^PutMsg /, ''))

/** The literal message IDs a line's function puts the way its line goes out; for a picker, every
 * number literal of its body (#109). */
export function putIds(input: FlowInput, source: Gen5Line['source']): number[] {
  const fn = source.function
  const body = bodyText(sourceText(input, source.file), fn)
  const what = putName(source.put)
  const messages =
    source.put === 'message literal' ? literalsIn(body) : putsOf(body, input.flowC, source.put)
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

/** The backend's tables of lines, by what the report calls them: the lines of hits, faints and
 * drags (#107, #108), and the lines of the effects (#109). */
export const LINE_TABLES = { lines: GEN5_LINES, 'effect lines': GEN5_EFFECT_LINES }

/** Holds every line of every table to its C, or throws by label (D9). */
export function checkBackendLines(input: FlowInput, text: TextNumbers): void {
  for (const lines of Object.values(LINE_TABLES)) checkLineSources(input, text, lines)
}
