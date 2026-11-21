// Readers for the pinned expansion's sources (plan §4): the packed enums of include/constants/,
// the display names in src/data/ and the Latin section of charmap.txt. They read the text the
// generator hands them and fail on any form they do not know, so a change upstream stops the
// generator instead of slipping a wrong number into a table.

// Comments go, strings and line breaks stay: a block comment keeps its line breaks.
const COMMENT_OR_STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

function stripComments(text: string): string {
  return text.replace(COMMENT_OR_STRING, (match) => {
    if (match.startsWith('//')) return ''
    if (match.startsWith('/*')) return match.replace(/[^\n]/g, '')
    return match
  })
}

// A macro over several lines becomes one line.
function joinContinuations(text: string): string {
  return text.replace(/\\\r?\n/g, ' ')
}

function enumBody(text: string, name: string): string {
  const head = new RegExp(String.raw`\benum\b[^{};]*\b${name}\s*\{`).exec(text)
  const end = head === null ? -1 : text.indexOf('}', head.index)
  if (head === null || end < 0) throw new Error(`no enum ${name}`)
  return text.slice(head.index + head[0].length, end)
}

const ENTRY = /^([A-Za-z_]\w*)(?:\s*=\s*(\w+))?\s*,?$/
const NUMBER = /^(?:0x[0-9a-f]+|\d+)$/i
// The TM and HM lines of items.h: the preprocessor writes those entries, so the parser cannot
// count them and stops counting until the next explicit number.
const METAPROGRAM = 'RECURSIVELY('
const DIRECTIVE = /^#\s*(?:define|undef)\b/

interface EnumState {
  readonly name: string
  readonly values: Map<string, number>
  next: number | undefined
}

function entryValue(state: EnumState, key: string, value: string | undefined): number {
  if (value === undefined) {
    if (state.next === undefined) {
      throw new Error(`enum ${state.name}: ${key} follows a metaprogram line`)
    }
    return state.next
  }
  if (NUMBER.test(value)) return Number(value)
  const alias = state.values.get(value)
  if (alias === undefined) throw new Error(`enum ${state.name}: ${key} names unknown ${value}`)
  return alias
}

function readEntry(state: EnumState, line: string): void {
  if (DIRECTIVE.test(line)) return
  if (line.startsWith(METAPROGRAM)) {
    state.next = undefined
    return
  }
  const match = ENTRY.exec(line)
  if (match?.[1] === undefined) throw new Error(`enum ${state.name}: cannot read "${line}"`)
  const value = entryValue(state, match[1], match[2])
  state.values.set(match[1], value)
  state.next = value + 1
}

/** The constants of one C enum in their order, with the value of each. */
export function parseEnum(text: string, name: string): Map<string, number> {
  const body = joinContinuations(enumBody(stripComments(text), name))
  const state: EnumState = { name, values: new Map(), next: 0 }
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line !== '') readEntry(state, line)
  }
  return state.values
}

/** The number of a plain `#define NAME number`; a define with any other value is an error. */
export function parseDefine(text: string, name: string): number {
  const pattern = new RegExp(String.raw`^\s*#\s*define\s+${name}\s+(.*)$`, 'gm')
  const values = [...stripComments(text).matchAll(pattern)].map((match) => (match[1] ?? '').trim())
  if (values.length !== 1) throw new Error(`no #define ${name}, or more than one`)
  const value = values[0] ?? ''
  if (!NUMBER.test(value)) throw new Error(`${name} is "${value}", not a number`)
  return Number(value)
}

/** The files a C file includes from one folder, in order. */
export function parseIncludes(text: string, dir: string): string[] {
  const includes = stripComments(text).matchAll(/^\s*#\s*include\s+"([^"]+)"/gm)
  return [...includes].map((match) => match[1] ?? '').filter((path) => path.startsWith(dir))
}

function readMacros(source: string): Map<string, string> {
  const macros = new Map<string, string>()
  for (const match of source.matchAll(/^\s*#\s*define\s+([A-Za-z_]\w*)(?:\([^)]*\))?(.*)$/gm)) {
    macros.set(match[1] ?? '', match[2] ?? '')
  }
  return macros
}

function stringEnd(code: string, start: number): number {
  let at = start + 1
  while (at < code.length && code[at] !== '"') at += code[at] === '\\' ? 2 : 1
  return at
}

// Where the value of `[KEY] = value` ends: at the comma or bracket that closes it.
function valueEnd(code: string, start: number): number {
  let depth = 0
  for (let at = start; at < code.length; at += 1) {
    const char = code[at] ?? ''
    if (char === '"') at = stringEnd(code, at)
    else if ('{('.includes(char)) depth += 1
    else if ('})'.includes(char) && depth === 0) return at
    else if ('})'.includes(char)) depth -= 1
    else if (char === ',' && depth === 0) return at
  }
  return code.length
}

const MACRO_DEPTH = 8

function nameIn(
  value: string,
  field: RegExp,
  macros: Map<string, string>,
  depth = 0,
): string | undefined {
  const direct = field.exec(value)?.[1]
  if (direct !== undefined || depth >= MACRO_DEPTH) return direct
  for (const [id] of value.matchAll(/\b[A-Za-z_]\w*\b/g)) {
    const body = macros.get(id)
    const found = body === undefined ? undefined : nameIn(body, field, macros, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * The display name of each `[PREFIX_X] = …` entry, read from `.field = _("…")` (or
 * `COMPOUND_STRING`, `ITEM_NAME`) inside the entry or inside the macros it uses. An entry without
 * a readable name stays out; the generator lists those.
 */
export function parseDisplayNames(
  text: string,
  prefix: string,
  field: string,
): Map<string, string> {
  const source = joinContinuations(stripComments(text))
  const macros = readMacros(source)
  const code = source.replace(/^\s*#.*$/gm, '')
  const fieldPattern = new RegExp(String.raw`\.${field}\s*=\s*\w*\(\s*"((?:[^"\\]|\\.)*)"`)
  const key = new RegExp(String.raw`\[(${prefix}_\w+)\]\s*=(?!=)`, 'g')
  const names = new Map<string, string>()
  for (let match = key.exec(code); match !== null; match = key.exec(code)) {
    const end = valueEnd(code, key.lastIndex)
    const name = nameIn(code.slice(key.lastIndex, end), fieldPattern, macros)
    const constant = match[1] ?? ''
    const known = names.get(constant)
    if (name !== undefined && known !== undefined && known !== name) {
      throw new Error(`${constant} is "${known}" and "${name}"`)
    }
    if (name !== undefined) names.set(constant, name)
    key.lastIndex = end
  }
  return names
}

export interface Charmap {
  /** The byte that ends a string (`'$'`). */
  readonly eos: number
  /** One character, one byte. */
  readonly chars: Readonly<Record<string, number>>
  /** The named sequences, such as `NBSP` and `PKMN`. */
  readonly named: Readonly<Record<string, readonly number[]>>
}

// The kana that follow map onto the same bytes as the Latin letters, so the table ends here.
const LATIN_END = '@ Hiragana'
const CHARMAP_LINE =
  /^(?:'(\\['\\]|[^'\\])'|([A-Z_][A-Z0-9_]*))\s*=\s*([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)\s*(?:@.*)?$/u

const hex = (byte: number) => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`

interface CharmapState {
  chars: Record<string, number>
  named: Record<string, number[]>
  eos?: number
}

function putChar(state: CharmapState, where: string, char: string, byte: number): void {
  if (char === '$') {
    state.eos = byte
    return
  }
  const known = state.chars[char]
  if (known !== undefined && known !== byte) {
    throw new Error(`${where}: '${char}' is ${hex(known)} and ${hex(byte)}`)
  }
  state.chars[char] = byte
}

function readCharmapLine(state: CharmapState, raw: string, number: number): void {
  const line = raw.trim()
  if (line === '' || line.startsWith('@')) return
  const where = `charmap line ${String(number)}`
  const match = CHARMAP_LINE.exec(line)
  if (match?.[3] === undefined) throw new Error(`${where}: cannot read "${line}"`)
  const bytes = match[3].split(/\s+/).map((byte) => parseInt(byte, 16))
  const quoted = match[1]
  if (quoted !== undefined && bytes.length > 1) throw new Error(`${where}: cannot read "${line}"`)
  if (quoted !== undefined) putChar(state, where, quoted.replace(/^\\/, ''), bytes[0] ?? 0)
  else state.named[match[2] ?? ''] = bytes
}

/** The Latin section of charmap.txt: the lines before the kana. */
export function parseCharmap(text: string): Charmap {
  const lines = text.split('\n')
  const end = lines.findIndex((line) => line.trim() === LATIN_END)
  if (end < 0) throw new Error(`charmap: no "${LATIN_END}" line`)
  const state: CharmapState = { chars: {}, named: {} }
  lines.slice(0, end).forEach((line, index) => {
    readCharmapLine(state, line, index + 1)
  })
  if (state.eos === undefined) throw new Error(`charmap: no '$' line for the end of a string`)
  return { eos: state.eos, chars: state.chars, named: state.named }
}
