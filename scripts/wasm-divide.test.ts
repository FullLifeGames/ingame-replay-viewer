// The division rewrite (#66) on small module texts, as wasm-dis prints them: folded, one op per
// line, its operands on the lines below. The run through Binaryen lives in wasm-divide-run.test.ts.
import { describe, expect, it } from 'vitest'

import { carryNames, DIVIDE_OPS, divideRewrite, helperName } from './wasm-divide.ts'
import type { DivideOp } from './wasm-divide.ts'

const typeOf = (op: DivideOp) => op.slice(0, 3)
const signature = (op: DivideOp) => {
  const type = typeOf(op)
  return `(param $0 ${type}) (param $1 ${type}) (result ${type})`
}

// A function as wasm-dis prints it: its header, then a body that divides its two parameters.
function func(name: string, header: string, op: DivideOp): string[] {
  return [
    ` (func $${name} ${header}`,
    `  (${op}`,
    '   (local.get $0)',
    `   (${typeOf(op)}.const 7)`,
    '  )',
    ' )',
  ]
}

const helper = (op: DivideOp) => func(helperName(op), signature(op), op)
const helpers = () => DIVIDE_OPS.flatMap(helper)
const user = (op: DivideOp, name = 'Use') => func(name, signature(op), op)
const moduleText = (...funcs: string[][]) => [
  '(module',
  ' (type $0 (func (param i32 i32) (result i32)))',
  ' (memory $0 1 1)',
  ' (data $.rodata (i32.const 0) "(i32.div_s\\00")',
  ' (export "Use" (func $Use))',
  ...funcs.flat(),
  ')',
]

function rewrite(lines: readonly string[]) {
  const rewriting = divideRewrite()
  const text = lines.map((line) => rewriting.line(line))
  return { text, counts: rewriting.finish() }
}

const counted = (entries: [DivideOp, number][]) =>
  Object.fromEntries(DIVIDE_OPS.map((op) => [op, entries.find(([kind]) => kind === op)?.[1] ?? 0]))

describe('the division rewrite', () => {
  it.each(DIVIDE_OPS)('turns %s outside the helpers into a call of its helper', (op) => {
    const lines = moduleText(helpers(), user(op))
    const { text, counts } = rewrite(lines)
    const at = lines.lastIndexOf(`  (${op}`)
    expect(text[at]).toBe(`  (call $${helperName(op)}`)
    expect(counts.rewritten).toEqual(counted([[op, 1]]))
  })

  it('names one helper per op kind', () => {
    expect(DIVIDE_OPS.map(helperName)).toEqual([
      'IrvWasm_I32DivS',
      'IrvWasm_I32DivU',
      'IrvWasm_I32RemS',
      'IrvWasm_I32RemU',
      'IrvWasm_I64DivS',
      'IrvWasm_I64DivU',
      'IrvWasm_I64RemS',
      'IrvWasm_I64RemU',
    ])
  })

  it('keeps the operands, their order and every other line', () => {
    const lines = moduleText(helpers(), user('i32.rem_u'))
    const { text } = rewrite(lines)
    const changed = text.flatMap((line, i) => (line === lines[i] ? [] : [[lines[i], line]]))
    expect(changed).toEqual([['  (i32.rem_u', '  (call $IrvWasm_I32RemU']])
    expect(text.length).toBe(lines.length)
  })

  it('leaves the ops inside the helpers alone and counts them apart', () => {
    const lines = moduleText(helpers())
    const { text, counts } = rewrite(lines)
    expect(text).toEqual(lines)
    expect(counts.rewritten).toEqual(counted([]))
    expect(counts.inHelpers).toEqual(counted(DIVIDE_OPS.map((op) => [op, 1])))
  })

  it('rewrites deeper ops and counts each site', () => {
    const nested = [
      ' (func $Mean (param $0 i32) (param $1 i32) (result i32)',
      '  (i32.div_u',
      '   (i32.rem_s',
      '    (local.get $0)',
      '    (local.get $1)',
      '   )',
      '   (i32.div_u',
      '    (local.get $1)',
      '    (i32.const 3)',
      '   )',
      '  )',
      ' )',
    ]
    const { text, counts } = rewrite(moduleText(helpers(), nested))
    expect(text.filter((line) => line.includes('(call $'))).toEqual([
      '  (call $IrvWasm_I32DivU',
      '   (call $IrvWasm_I32RemS',
      '   (call $IrvWasm_I32DivU',
    ])
    expect(counts.rewritten).toEqual(
      counted([
        ['i32.div_u', 2],
        ['i32.rem_s', 1],
      ]),
    )
  })

  it('leaves the lines outside the functions alone', () => {
    const lines = moduleText(helpers())
    expect(rewrite(lines).text[3]).toBe(' (data $.rodata (i32.const 0) "(i32.div_s\\00")')
  })

  it('refuses a module without the helpers and names the missing ones with the counts', () => {
    const lines = moduleText(user('i32.div_s'))
    expect(() => rewrite(lines)).toThrow(
      'the module lacks the division helpers IrvWasm_I32DivS, IrvWasm_I32DivU, IrvWasm_I32RemS, IrvWasm_I32RemU, IrvWasm_I64DivS, IrvWasm_I64DivU, IrvWasm_I64RemS, IrvWasm_I64RemU',
    )
    expect(() => rewrite(lines)).toThrow('i32.div_s 1, i32.div_u 0,')
  })

  it('refuses a module that lacks one helper', () => {
    const lines = moduleText(DIVIDE_OPS.filter((op) => op !== 'i64.rem_u').flatMap(helper))
    expect(() => rewrite(lines)).toThrow(/lacks the division helpers IrvWasm_I64RemU;/)
  })

  it('refuses a helper whose signature differs from its op', () => {
    const wrong = func(helperName('i64.div_u'), signature('i32.div_u'), 'i32.div_u')
    const lines = moduleText(DIVIDE_OPS.filter((op) => op !== 'i64.div_u').flatMap(helper), wrong)
    expect(() => rewrite(lines)).toThrow(
      'the division helper IrvWasm_I64DivU takes (i32, i32) -> i32, not (i64, i64) -> i64',
    )
  })

  it('refuses an op that is not folded on a line of its own', () => {
    const inline = [
      ' (func $Use (param $0 i32) (result i32)',
      '  (i32.div_s (local.get $0) (i32.const 2))',
      ' )',
    ]
    expect(() => rewrite(moduleText(helpers(), inline))).toThrow(
      'line 55: i32.div_s not on a line of its own in $Use: "  (i32.div_s (local.get $0) (i32.const 2))"',
    )
  })
})

// A module's bytes: the header, then sections as [id, ...content] with their sizes written.
const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]
const section = (id: number, content: number[]) => [id, content.length, ...content]
const custom = (name: string, body: number[]) =>
  section(0, [name.length, ...Buffer.from(name), ...body])
const TYPES = section(1, [1, 0x60, 0, 0])
const NAMES = custom('name', [1, 4, 1, 0, 1, 0x66])
const bytes = (...sections: number[][]) => Uint8Array.from([...HEADER, ...sections.flat()])

describe('the name section after wasm-as', () => {
  it('carries the original name section to the end of the assembled module', () => {
    expect(carryNames(bytes(TYPES, NAMES), bytes(TYPES))).toEqual(bytes(TYPES, NAMES))
  })

  it('refuses an original with another custom section', () => {
    const producers = custom('producers', [0])
    expect(() => carryNames(bytes(TYPES, NAMES, producers), bytes(TYPES))).toThrow(
      'the module holds the custom section producers, which the division rewrite would drop',
    )
  })

  it('refuses an assembled module that holds names already', () => {
    expect(() => carryNames(bytes(TYPES, NAMES), bytes(TYPES, NAMES))).toThrow(
      'wasm-as wrote a custom section (name); the rewrite assembles without one',
    )
  })

  it('refuses an original without names, as the helpers are found by name', () => {
    expect(() => carryNames(bytes(TYPES), bytes(TYPES))).toThrow(
      'the module has no name section; the link keeps it with --profiling-funcs',
    )
  })
})
