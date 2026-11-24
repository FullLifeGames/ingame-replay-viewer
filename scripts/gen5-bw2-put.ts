// Reads how the server's command queue packs each argument format, from the pinned pokebw2
// checkout's btl_server_cmd.c (#72): every `case` of PutCmdArgs becomes a list of puts, each put
// the fields `(args[k] & mask) << shift` ORed into 1 to 4 bytes, high byte first. Also reads which
// formats the client reads as messages and which command carries a sound. The functions are found
// by their names and recognised by their features, each checked on its own; the readers hold no
// statement of pokebw2. Statements of any other shape throw, naming the statement or the missing
// feature, so the packer never guesses a layout.
import type { ArgField, ArgFormat, ArgPut, MessageRules } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, closingBrace, literal, stripComments } from './gen5-bw2-c.ts'

const squeeze = (text: string) => text.replace(/\s+/g, '')

/** Where a put is read: the format's name for errors and the name of the arguments' array. */
interface Site {
  where: string
  args: string
}

/** The parameter names of the function `name` where it is defined, `...` for a variadic tail. */
function paramNames(code: string, name: string): string[] {
  const match = new RegExp(`\\b${name}\\(([^)]*)\\)\\s*\\{`).exec(code)
  if (match?.[1] === undefined) throw new Error(`no definition of ${name} in the source`)
  return match[1].split(',').map((param) => /(\w+|\.\.\.)\s*$/.exec(param)?.[1] ?? '')
}

/** True when the parentheses at both ends of `text` belong together. */
function wrapped(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) return false
  let depth = 0
  for (let i = 0; i < text.length - 1; i += 1) {
    depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0
    if (depth === 0) return false
  }
  return true
}

function unwrap(text: string): string {
  let inner = text.trim()
  while (wrapped(inner)) inner = inner.slice(1, -1).trim()
  return inner
}

/** Splits at `separator` where no parenthesis is open. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0
    if (depth === 0 && text[i] === separator) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  return [...parts, text.slice(start)]
}

/** True when `mask` is all ones and, shifted, still fits `width` bits. */
const fits = (mask: number | undefined, shift: number, width: number) =>
  mask !== undefined &&
  Number.isInteger(Math.log2(mask + 1)) &&
  (mask + 1) * 2 ** shift <= 2 ** width

function fieldOf(term: string, width: number, site: Site): ArgField {
  const [, value = term, shift = '0'] = /^(.+?)<<(\d+)$/.exec(term) ?? []
  const [, array, arg, maskText] = /^(\w+)\[(\d+)\](?:&(\w+))?$/.exec(unwrap(value)) ?? []
  const mask = maskText === undefined ? 2 ** width - 1 : literal(maskText)
  if (array !== site.args || mask === undefined || !fits(mask, Number(shift), width)) {
    throw new Error(`${site.where}: cannot place "${term}" in ${String(width)} bits`)
  }
  return { arg: Number(arg), mask, shift: Number(shift) }
}

/** The fields of one put's value; a cast to a narrower type narrows the room they have. */
function fieldsOf(expression: string, bytes: number, site: Site): ArgField[] {
  let text = unwrap(squeeze(expression))
  let width = bytes * 8
  const cast = /^\(u(8|16|32)\)/.exec(text)
  if (cast?.[1] !== undefined) {
    width = Math.min(width, Number(cast[1]))
    text = unwrap(text.slice(cast[0].length))
  }
  return splitTop(text, '|').map((term) => fieldOf(unwrap(term), width, site))
}

function putsOf(statement: string, site: Site): ArgPut[] {
  const plain = /^PutU(8|16|24|32)\(\w+,(.+)\)$/.exec(statement)
  if (plain?.[1] !== undefined && plain[2] !== undefined) {
    const bytes = Number(plain[1]) / 8
    return [{ bytes, fields: fieldsOf(plain[2], bytes, site) }]
  }
  const halves = /^PutHalfwords\(\w+,(.+)\)$/.exec(statement)
  const parts = halves?.[1] === undefined ? [] : splitTop(halves[1], ',')
  if (parts.length !== 2) throw new Error(`${site.where}: cannot read the statement "${statement}"`)
  return parts.map((part) => ({ bytes: 2, fields: fieldsOf(part, 2, site) }))
}

/** Unrolls `for(n=0;n<N;n++){...}` (or `++n`) into N copies with `args[n]` numbered. */
function unrollLoops(body: string, args: string): string {
  const loop = /for\((\w+)=0;\1<(\d+);(?:\1\+\+|\+\+\1)\)\{([^}]*)\}/g
  return body.replace(loop, (_, index: string, count: string, inner: string) =>
    Array.from({ length: Number(count) }, (_unused, k) =>
      inner.replaceAll(`${args}[${index}]`, `${args}[${String(k)}]`),
    ).join(''),
  )
}

function casePuts(body: string, site: Site): ArgPut[] {
  return unrollLoops(body, site.args)
    .split(';')
    .filter((statement) => statement !== '' && statement !== 'break')
    .flatMap((statement) => putsOf(statement, site))
}

/** The switch's cases in PutCmdArgs, by format name, as squeezed text, and the name of its
 * arguments' array. The command goes first, as a halfword, before the switch on the format. */
function switchCases(source: string): { cases: Map<string, string>; args: string } {
  const code = stripComments(source)
  const body = squeeze(bodyOf(code, 'PutCmdArgs('))
  const [, event, format, args = ''] = paramNames(code, 'PutCmdArgs')
  const open = body.indexOf(`switch(${String(format)}){`) + `switch(${String(format)})`.length
  if (open < `switch()`.length) throw new Error('PutCmdArgs no longer switches on its format')
  const first = /Put(\w+)\(\w+,(\w+)\);/.exec(body)
  if (first?.[1] !== 'U16' || first[2] !== event || first.index > open) {
    throw new Error('PutCmdArgs no longer writes the command as a halfword first')
  }
  const parts = body.slice(open + 1, closingBrace(body, open) - 1).split(/case(\w+):/)
  const cases = new Map<string, string>()
  for (let i = 1; i < parts.length; i += 2) cases.set(parts[i] ?? '', parts[i + 1] ?? '')
  return { cases, args }
}

function argCount(puts: readonly ArgPut[]): number {
  return Math.max(0, ...puts.flatMap((put) => put.fields.map((field) => field.arg + 1)))
}

/** Each format's puts; the low nibble of its code must equal the arguments it uses. */
export function parseArgFormats(
  source: string,
  codes: Readonly<Record<string, number>>,
  messageFormats: readonly string[],
): Record<string, ArgFormat> {
  const { cases, args } = switchCases(source)
  const formats: Record<string, ArgFormat> = {}
  for (const [name, code] of Object.entries(codes)) {
    const body = cases.get(name)
    if (body === undefined && !messageFormats.includes(name)) {
      throw new Error(`PutCmdArgs has no case for ${name}, which is no message format`)
    }
    const puts = body === undefined ? [] : casePuts(body, { where: name, args })
    const count = argCount(puts)
    if (count !== (code & 0xf)) {
      throw new Error(
        `${name}: the low nibble says ${String(code & 0xf)} arguments, the puts use ${String(count)}`,
      )
    }
    formats[name] = { code, argCount: count, puts }
  }
  return formats
}

/** The constants the reader sets its format against before it reads command arguments: the
 * format comes from a table indexed by the command, once. */
function messageFormats(code: string): string[] {
  const reader = bodyOf(code, 'BtlServerCmdQueue_Read(')
  const tables = [...reader.matchAll(/\b(\w+)\s*=\s*\w+\s*\[\s*\w+\s*\]\s*;/g)]
  const format = tables.length === 1 ? tables[0]?.[1] : undefined
  if (format === undefined) {
    throw new Error('BtlServerCmdQueue_Read no longer takes the format from a table, once')
  }
  const tests = squeeze(reader).matchAll(new RegExp(`\\b${format}!=(\\w+)`, 'g'))
  const formats = [...tests].map((match) => match[1] ?? '')
  if (formats.length === 0) throw new Error('BtlServerCmdQueue_Read names no message format')
  return formats
}

const PUT_MSG = 'BtlServerCmdQueue_PutMsg'

/** Feature 1: the writer starts with the command (its parameter `event`) and the message, each
 * as a halfword. */
function checkHalfwordsFirst(body: string, event: string | undefined): void {
  const [first, second] = body.matchAll(/Put(\w+)\(\w+,(\w+)\);/g)
  if (first?.[1] !== 'U16' || first[2] !== event || second?.[1] !== 'U16') {
    throw new Error(`${PUT_MSG} no longer starts with the command and the message as halfwords`)
  }
}

/** Feature 2: exactly one `if (event == X)` puts an extra halfword, the sound; gives X and where
 * the condition stands. */
function soundPut(body: string, event: string | undefined): { command: string; at: number } {
  const conditional = new RegExp(`if\\(${String(event)}==(\\w+)\\)\\{([^{}]*)\\}`, 'g')
  const sounds = [...body.matchAll(conditional)].filter((match) => match[2]?.includes('PutU16('))
  const [sound] = sounds
  if (sounds.length !== 1 || sound?.[1] === undefined) {
    throw new Error(`${PUT_MSG} no longer puts the extra halfword of a sound for one command`)
  }
  return { command: sound[1], at: sound.index }
}

/** Feature 3: after the sound, a `do { ... } while (x != END);` loop puts 32-bit words. */
function checkWordLoop(body: string, after: number): void {
  const loop = /do\{([^{}]*)\}while\(\w+!=\w+\);/.exec(body)
  if (loop?.[1]?.includes('PutU32(') !== true || loop.index < after) {
    throw new Error(`${PUT_MSG} no longer puts words up to an end marker after the sound`)
  }
}

/** The one command for which the writer puts the extra halfword of a sound. */
function soundCommand(code: string): string {
  const body = squeeze(bodyOf(code, `${PUT_MSG}(`))
  const [, event] = paramNames(code, PUT_MSG)
  checkHalfwordsFirst(body, event)
  const sound = soundPut(body, event)
  checkWordLoop(body, sound.at)
  return sound.command
}

/** The formats the reader routes to its message reader, and the one command with a sound. */
export function parseMessageRules(source: string, argEnd: number): MessageRules {
  const code = stripComments(source)
  return { formats: messageFormats(code), soundCommand: soundCommand(code), argEnd }
}
