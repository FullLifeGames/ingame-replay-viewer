// npm run wasm:divide (#66): WebAssembly traps on a zero divisor and on INT_MIN / -1, where the
// ROM's libgcc helpers return a value. After the link, each 32-bit and 64-bit division and
// remainder outside the helpers becomes a call of its helper, which the glue exports (66-3).
// Binaryen's wasm-dis prints the module as folded text: an op opens a line of its own and its two
// operands follow on the lines below, so the op line becomes `(call $<helper>` and the operands
// keep their order. The text (95 MB for the game) passes one line at a time and never sits in one
// string. wasm-as assembles it without names, and the module's own name section goes back on the
// end: the rewrite changes no function's index, so the names still fit.
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { runCliAsync } from './rom-cli.ts'
import { REPO_DIR } from './rom-paths.ts'
import { wasmPaths } from './wasm-compile.ts'

export const DIVIDE_OPS = [
  'i32.div_s',
  'i32.div_u',
  'i32.rem_s',
  'i32.rem_u',
  'i64.div_s',
  'i64.div_u',
  'i64.rem_s',
  'i64.rem_u',
] as const
export type DivideOp = (typeof DIVIDE_OPS)[number]

/** The helper of an op, (iN, iN) -> iN: i32.div_s has IrvWasm_I32DivS, i64.rem_u IrvWasm_I64RemU. */
export function helperName(op: DivideOp): string {
  const [type = '', kind = ''] = op.split('.')
  const [verb = '', sign = ''] = kind.split('_')
  return `IrvWasm_${type.toUpperCase()}${verb.charAt(0).toUpperCase()}${verb.slice(1)}${sign.toUpperCase()}`
}

const HELPER_OPS = new Map(DIVIDE_OPS.map((op) => [helperName(op), op]))
const helperSignature = (op: DivideOp) => {
  const type = op.slice(0, 3)
  return `(${type}, ${type}) -> ${type}`
}

export interface DivideCounts {
  /** The sites that now call their helper. */
  rewritten: Record<DivideOp, number>
  /** The ops inside the helpers' own bodies, which stay ops. */
  inHelpers: Record<DivideOp, number>
}

interface DivideRewrite {
  /** One line of wasm-dis's text in, the line to assemble out. */
  line: (text: string) => string
  /** After the last line: the counts, or an error when a helper is missing or does not fit. */
  finish: () => DivideCounts
}

const FOLDED_OP = /^(\s+)\((i(?:32|64)\.(?:div|rem)_[su])$/
const ANY_OP = /\bi(?:32|64)\.(?:div|rem)_[su]\b/
// A line that opens a form of the module: a function, an import, a data segment, an export.
const MODULE_FORM = ' ('
const FUNC_HEADER = /^ \(func \$([^\s()]+)(.*)$/

const zeroCounts = () =>
  Object.fromEntries(DIVIDE_OPS.map((op) => [op, 0])) as Record<DivideOp, number>

const countLine = (counts: Record<DivideOp, number>): string =>
  DIVIDE_OPS.map((op) => `${op} ${String(counts[op])}`).join(', ')

// A function header's types: `(param $0 i32) (param $1 i32) (result i32)` is (i32, i32) -> i32.
function signatureOf(header: string): string {
  const types = (word: string) =>
    [...header.matchAll(new RegExp(`\\(${word} (?:\\$[^\\s()]+ )?([^)]+)\\)`, 'g'))].flatMap(
      (match) => (match[1] ?? '').split(' '),
    )
  return `(${types('param').join(', ')}) -> ${types('result').join(', ')}`
}

function checkHelpers(found: ReadonlyMap<DivideOp, string>, rewritten: DivideCounts['rewritten']) {
  const missing = DIVIDE_OPS.filter((op) => !found.has(op)).map(helperName)
  if (missing.length > 0) {
    throw new Error(
      `the module lacks the division helpers ${missing.join(', ')}; the glue exports them (#66). ` +
        `It divides outside them: ${countLine(rewritten)}`,
    )
  }
  for (const [op, signature] of found) {
    if (signature !== helperSignature(op)) {
      throw new Error(
        `the division helper ${helperName(op)} takes ${signature}, not ${helperSignature(op)}`,
      )
    }
  }
}

const unfolded = (lineNumber: number, func: string, text: string) =>
  new Error(
    `line ${String(lineNumber)}: ${ANY_OP.exec(text)?.[0] ?? ''} not on a line of its own in ` +
      `$${func}: ${JSON.stringify(text)}`,
  )

export function divideRewrite(): DivideRewrite {
  const counts: DivideCounts = { rewritten: zeroCounts(), inHelpers: zeroCounts() }
  const found = new Map<DivideOp, string>()
  let lineNumber = 0
  // The function the line lies in, and its op when it is a helper; undefined outside functions.
  let func: { name: string; helper: DivideOp | undefined } | undefined

  function enter(text: string): void {
    const [, name, rest = ''] = FUNC_HEADER.exec(text) ?? []
    const helper = name === undefined ? undefined : HELPER_OPS.get(name)
    if (helper !== undefined) found.set(helper, signatureOf(rest))
    func = name === undefined ? undefined : { name, helper }
  }

  function inside(
    text: string,
    { name, helper }: { name: string; helper: DivideOp | undefined },
  ): string {
    const [, indent = '', op] = FOLDED_OP.exec(text) ?? []
    if (op === undefined) {
      if (ANY_OP.test(text)) throw unfolded(lineNumber, name, text)
      return text
    }
    const kind = op as DivideOp
    if (helper !== undefined) {
      counts.inHelpers[kind] += 1
      return text
    }
    counts.rewritten[kind] += 1
    return `${indent}(call $${helperName(kind)}`
  }

  return {
    line: (text) => {
      lineNumber += 1
      if (text.startsWith(MODULE_FORM)) enter(text)
      else if (func !== undefined) return inside(text, func)
      return text
    },
    finish: () => {
      checkHelpers(found, counts.rewritten)
      return counts
    },
  }
}

// A section of a module's bytes, from its id byte to its end; a custom one has its name.
interface Section {
  name?: string
  start: number
  end: number
}

function readLeb(bytes: Uint8Array, at: number): [number, number] {
  let value = 0
  let shift = 0
  let next = at
  for (;;) {
    const byte = bytes[next]
    if (byte === undefined)
      throw new Error(`the module ends inside a section header at ${String(at)}`)
    value += (byte & 0x7f) * 2 ** shift
    shift += 7
    next += 1
    if ((byte & 0x80) === 0) return [value, next]
  }
}

function sections(bytes: Uint8Array): Section[] {
  const found: Section[] = []
  for (let start = 8; start < bytes.length;) {
    const [size, content] = readLeb(bytes, start + 1)
    const end = content + size
    if (bytes[start] === 0) {
      const [length, name] = readLeb(bytes, content)
      found.push({ name: Buffer.from(bytes.subarray(name, name + length)).toString(), start, end })
    } else found.push({ start, end })
    start = end
  }
  return found
}

/** The bytes of the module's name section; the module may hold no other custom section. */
function nameSection(original: Uint8Array): Uint8Array {
  const custom = sections(original).filter((section) => section.name !== undefined)
  const other = custom.find((section) => section.name !== 'name')
  if (other !== undefined) {
    throw new Error(
      `the module holds the custom section ${other.name ?? ''}, which the division rewrite would drop`,
    )
  }
  const names = custom[0]
  if (names === undefined)
    throw new Error('the module has no name section; the link keeps it with --profiling-funcs')
  return original.subarray(names.start, names.end)
}

function appendSection(assembled: Uint8Array, names: Uint8Array): Uint8Array {
  const written = sections(assembled).find((section) => section.name !== undefined)
  if (written !== undefined) {
    throw new Error(
      `wasm-as wrote a custom section (${written.name ?? ''}); the rewrite assembles without one`,
    )
  }
  const out = new Uint8Array(assembled.length + names.length)
  out.set(assembled)
  out.set(names, assembled.length)
  return out
}

/** The assembled module with the original's name section on its end. */
export const carryNames = (original: Uint8Array, assembled: Uint8Array): Uint8Array =>
  appendSection(assembled, nameSection(original))

// The features emcc 7.0.0 hands its own wasm-opt at the link (its EMCC_DEBUG log); the module
// carries no target_features section, which the link strips, so Binaryen reads them from here.
const LINK_FEATURES = [
  '--mvp-features',
  '--enable-bulk-memory',
  '--enable-bulk-memory-opt',
  '--enable-call-indirect-overlong',
  '--enable-multivalue',
  '--enable-mutable-globals',
  '--enable-nontrapping-float-to-int',
  '--enable-reference-types',
  '--enable-sign-ext',
] as const

/** A Binaryen tool of the pinned Emscripten: emsdk/upstream/bin beside upstream/emscripten. */
export function binaryenTool(emcc: string, tool: string): string {
  return join(dirname(dirname(emcc)), 'bin', tool)
}

function needTool(emcc: string, tool: string): string {
  const path = binaryenTool(emcc, tool)
  if (!existsSync(path)) throw new Error(`no ${tool} at ${path}; it comes with emsdk`)
  return path
}

// wasm-dis's text through the rewrite into a file, in chunks of about 1 MB.
async function rewriteText(dis: string, input: string, text: string): Promise<DivideCounts> {
  const child = spawn(dis, [...LINK_FEATURES, input], { stdio: ['ignore', 'pipe', 'inherit'] })
  const closed = once(child, 'close') as Promise<[number | null]>
  const rewriting = divideRewrite()
  const fd = openSync(text, 'w')
  let chunk: string[] = []
  let size = 0
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      chunk.push(rewriting.line(line))
      size += line.length + 1
      if (size < 1 << 20) continue
      writeSync(fd, `${chunk.join('\n')}\n`)
      chunk = []
      size = 0
    }
    if (chunk.length > 0) writeSync(fd, `${chunk.join('\n')}\n`)
  } finally {
    closeSync(fd)
    if (child.exitCode === null) child.kill()
  }
  const [code] = await closed
  if (code !== 0) throw new Error(`wasm-dis failed on ${input} (exit ${String(code)})`)
  return rewriting.finish()
}

/**
 * The module at input with each division and remainder outside the helpers turned into a call of
 * its helper, written to output (which may be input). Nothing is written when the rewrite refuses.
 */
export async function divideModule(
  input: string,
  output: string,
  emcc: string,
): Promise<DivideCounts> {
  const names = nameSection(readFileSync(input))
  const [dis, as] = [needTool(emcc, 'wasm-dis'), needTool(emcc, 'wasm-as')]
  const dir = mkdtempSync(join(dirname(output), '.divide-'))
  try {
    const text = join(dir, 'divided.wat')
    const counts = await rewriteText(dis, input, text)
    const assembled = join(dir, 'divided.wasm')
    execFileSync(as, [...LINK_FEATURES, text, '-o', assembled], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    writeFileSync(assembled, appendSection(readFileSync(assembled), names))
    renameSync(assembled, output)
    return counts
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  await runCliAsync('wasm:divide', async () => {
    const [input, output] = process.argv.slice(2)
    if (input === undefined || output === undefined) {
      throw new Error('usage: wasm:divide <module.wasm> <divided.wasm>')
    }
    const counts = await divideModule(resolve(input), resolve(output), wasmPaths(REPO_DIR).emcc)
    process.stdout.write(
      `wasm:divide: calls the helpers at ${countLine(counts.rewritten)}; ` +
        `the helpers keep ${countLine(counts.inHelpers)}; wrote ${resolve(output)}\n`,
    )
  })
}

if (import.meta.main) await main()
