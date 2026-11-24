// Reads the pinned pokebw2 checkout's C sources and ds-decomp symbol lists for the Gen 5 spike
// (#72): symbols, enums, defines, a function's body and a designated-initializer table. Each reader
// accepts only the plain forms it knows and throws on anything else, naming what it met, so a
// changed source stops the run instead of yielding a wrong number.
import type { Bw2Symbol } from '../src/gen5/bw2-numbers.ts'

const NUMBER = /^(0x[0-9a-f]+|\d+)$/i

/** A C integer literal (decimal or hex, an optional `u`/`l` suffix), or undefined. */
export function literal(text: string): number | undefined {
  const bare = text.trim().replace(/[ul]+$/i, '')
  return NUMBER.test(bare) ? Number(bare) : undefined
}

/** The source without `//` and block comments. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** The index just past the brace that closes the one at `open`. */
export function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    if (text[i] === '}') depth -= 1
    if (depth === 0) return i + 1
  }
  throw new Error(`the brace at ${String(open)} is never closed`)
}

/** The text inside the braces of the first `opener` that a body follows (not a prototype). */
export function bodyOf(source: string, opener: string): string {
  let at = source.indexOf(opener)
  while (at >= 0) {
    const end = source.indexOf(')', at)
    const brace = end + 1 + source.slice(end + 1).search(/\S/)
    if (source[brace] === '{') return source.slice(brace + 1, closingBrace(source, brace) - 1)
    at = source.indexOf(opener, at + opener.length)
  }
  throw new Error(`no body follows ${opener} in the source`)
}

const SYMBOL_LINE =
  /^(\S+) kind:(function|data|bss|label)(?:\(([^)]*)\))? addr:0x([0-9a-f]+)(?: ambiguous| local)*$/i

function symbolOf(line: string, module: string): Bw2Symbol {
  const match = SYMBOL_LINE.exec(line)
  if (match === null) throw new Error(`${module}: cannot read the symbol line "${line}"`)
  const [, name = '', kind = '', detail = '', address = ''] = match
  const symbol: Bw2Symbol = {
    name,
    kind: kind as Bw2Symbol['kind'],
    address: Number.parseInt(address, 16),
    module,
  }
  const size = /size=0x([0-9a-f]+)/i.exec(detail)?.[1]
  return size === undefined ? symbol : { ...symbol, size: Number.parseInt(size, 16) }
}

/** The lines of a ds-decomp `symbols.txt`; `module` names the list (`arm9`, `ov167`). */
export function parseSymbols(text: string, module: string): Bw2Symbol[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => symbolOf(line, module))
}

/** The named symbols; throws on a name that is missing or listed more than once. */
export function pickSymbols(
  symbols: readonly Bw2Symbol[],
  names: readonly string[],
): Record<string, Bw2Symbol> {
  const picked: Record<string, Bw2Symbol> = {}
  for (const name of names) {
    const found = symbols.filter((symbol) => symbol.name === name)
    if (found.length !== 1 || found[0] === undefined) {
      throw new Error(`the symbol ${name} is listed ${String(found.length)} times, not once`)
    }
    picked[name] = found[0]
  }
  return picked
}

function enumValues(entries: readonly string[]): Record<string, number> {
  const values: Record<string, number> = {}
  let next = 0
  for (const entry of entries) {
    const [name = '', value] = entry.split('=').map((part) => part.trim())
    const explicit = value === undefined ? next : literal(value)
    if (explicit === undefined || !/^\w+$/.test(name)) {
      throw new Error(`cannot read the enum entry "${entry}" without computing it`)
    }
    values[name] = explicit
    next = explicit + 1
  }
  return values
}

/** The values of the enum whose body names `member`, counting on from each explicit value. */
export function enumAround(source: string, member: string): Record<string, number> {
  for (const match of stripComments(source).matchAll(/\benum\b[^{;]*\{([^}]*)\}/g)) {
    const entries = (match[1] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    if (entries.some((entry) => entry.split('=')[0]?.trim() === member)) {
      return enumValues(entries)
    }
  }
  throw new Error(`no enum names ${member}`)
}

/** The value of `#define name <literal>`. */
export function defineValue(source: string, name: string): number {
  const match = new RegExp(`^\\s*#define\\s+${name}\\s+(\\S+)`, 'm').exec(source)
  const value = match?.[1] === undefined ? undefined : literal(match[1])
  if (value === undefined) throw new Error(`no #define ${name} with a plain number`)
  return value
}

export interface FormatTable {
  /** The name in the table's brackets, which bounds the commands it covers. */
  bound: string
  entries: Record<string, string>
}

/** A table `name[BOUND] = { [KEY] = VALUE, ... }` of names. */
export function parseFormatTable(source: string, table: string): FormatTable {
  const code = stripComments(source)
  const head = new RegExp(`\\b${table}\\[(\\w+)\\]\\s*=\\s*\\{`).exec(code)
  if (head === null) throw new Error(`no table ${table}[...] = { ... } in the source`)
  const open = head.index + head[0].length - 1
  const body = code.slice(open + 1, closingBrace(code, open) - 1)
  const entries: Record<string, string> = {}
  for (const entry of body.split(',').map((text) => text.trim())) {
    if (entry === '') continue
    const match = /^\[(\w+)\]\s*=\s*(\w+)$/.exec(entry)
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`${table}: cannot read the entry "${entry}"`)
    }
    entries[match[1]] = match[2]
  }
  return { bound: head[1] ?? '', entries }
}
