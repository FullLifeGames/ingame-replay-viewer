// Lays out a C struct of the pinned pokebw2 checkout as the ARM9's compiler does (#72), so the
// adapter's offsets come from its struct and not from a hand-written list. The rules are the ARM
// procedure call standard's (AAPCS, "Data types and alignment"): a scalar or pointer sits at a
// multiple of its size; a struct takes its largest member's alignment and pads its size to it; a
// bitfield takes the next free bits of a container of its declared type, lowest bits first on a
// little-endian target, and starts a new container when it would cross one. A typedef of a
// function pointer is a pointer. Members of any other shape (unions, anonymous structs, arrays
// sized by a name, unknown types) throw, unless the layout stops before them: a member's offset
// depends only on the members before it.
import type { FieldLayout, StructLayout } from '../src/gen5/bw2-numbers.ts'
import { closingBrace, literal, stripComments } from './gen5-bw2-c.ts'

/** Sizes of the scalar types the battle structs use (pokebw2 include/types.h, ARM9). */
const SCALARS: Readonly<Record<string, number>> = {
  u8: 1,
  s8: 1,
  u16: 2,
  s16: 2,
  u32: 4,
  s32: 4,
  int: 4,
  BOOL: 4,
}
const POINTER = 4

interface Cursor {
  bit: number
  align: number
  fields: Record<string, FieldLayout>
}

const MEMBER = /^(\w+)\s*(\*+)?\s*(\w+)\s*(?:\[([^\]]+)\])?\s*(?::\s*(\d+))?$/

/** The body of `struct name { ... }` or `typedef struct [tag] { ... } name;`. */
function structBody(code: string, name: string): string {
  const tagged = new RegExp(`\\bstruct\\s+${name}\\s*\\{`).exec(code)
  if (tagged !== null) {
    const open = tagged.index + tagged[0].length - 1
    return code.slice(open + 1, closingBrace(code, open) - 1)
  }
  for (const typedef of code.matchAll(/\btypedef\s+struct\s*\w*\s*\{/g)) {
    const open = typedef.index + typedef[0].length - 1
    const close = closingBrace(code, open)
    if (new RegExp(`^\\s*${name}\\s*;`).test(code.slice(close)))
      return code.slice(open + 1, close - 1)
  }
  throw new Error(`no struct ${name} in the source`)
}

function placeBits(cursor: Cursor, name: string, type: string, bits: number): void {
  const size = SCALARS[type]
  if (size === undefined) throw new Error(`the bitfield ${name} has the type ${type}, no scalar`)
  const width = size * 8
  let start = Math.floor(cursor.bit / width) * width
  if (cursor.bit + bits > start + width) start += width
  cursor.bit = Math.max(cursor.bit, start)
  cursor.fields[name] = { offset: start / 8, size, bit: cursor.bit - start, bits }
  cursor.bit += bits
  cursor.align = Math.max(cursor.align, size)
}

function placeWhole(cursor: Cursor, name: string, unit: StructLayout, count: number): void {
  const offset = Math.ceil(Math.ceil(cursor.bit / 8) / unit.align) * unit.align
  cursor.fields[name] = { offset, size: unit.size * count }
  for (const [path, field] of Object.entries(unit.fields)) {
    cursor.fields[`${name}.${path}`] = { ...field, offset: offset + field.offset }
  }
  cursor.bit = (offset + unit.size * count) * 8
  cursor.align = Math.max(cursor.align, unit.align)
}

/** True when `type` is a typedef of a function pointer, `typedef R (*type)(...)`. */
const isFunctionPointer = (code: string, type: string) =>
  new RegExp(`\\btypedef\\b[^;{}]*\\(\\s*\\*\\s*${type}\\s*\\)\\s*\\(`).test(code)

function unitOf(code: string, type: string, pointer: boolean): StructLayout {
  if (pointer || isFunctionPointer(code, type)) return { size: POINTER, align: POINTER, fields: {} }
  const scalar = SCALARS[type]
  return scalar === undefined ? layoutOf(code, type) : { size: scalar, align: scalar, fields: {} }
}

/** Places one member; returns its name. */
function placeMember(cursor: Cursor, code: string, member: string): string {
  const match = /[{}]|\bunion\b|\bstruct\b/.test(member) ? null : MEMBER.exec(member)
  const [, type = '', stars, name = '', count, bits] = match ?? []
  const length = count === undefined ? 1 : literal(count)
  if (match === null || length === undefined) {
    throw new Error(`cannot lay out the member "${member}"`)
  }
  if (bits !== undefined) placeBits(cursor, name, type, Number(bits))
  else placeWhole(cursor, name, unitOf(code, type, stars !== undefined), length)
  return name
}

function membersOf(code: string, name: string): string[] {
  return structBody(code, name)
    .split(';')
    .map((member) => member.trim().replace(/\s+/g, ' '))
    .filter((member) => member !== '')
}

function layoutOf(code: string, name: string, upTo?: string): StructLayout {
  const cursor: Cursor = { bit: 0, align: 1, fields: {} }
  const members = membersOf(code, name)
  if (upTo !== undefined && !members.some((member) => MEMBER.exec(member)?.[3] === upTo)) {
    throw new Error(`the struct ${name} has no member ${upTo}`)
  }
  for (const member of members) {
    if (placeMember(cursor, code, member) !== upTo) continue
    return { size: Math.ceil(cursor.bit / 8), align: cursor.align, fields: cursor.fields, upTo }
  }
  const size = Math.ceil(Math.ceil(cursor.bit / 8) / cursor.align) * cursor.align
  return { size, align: cursor.align, fields: cursor.fields }
}

/** The layout of the struct `name`, its nested structs' fields under dotted paths; with `upTo`,
 * only the members up to and with that one (`size` then ends with it). */
export function structLayout(source: string, name: string, upTo?: string): StructLayout {
  return layoutOf(stripComments(source), name, upTo)
}

/** The first member of the struct `name` as written, such as `BattleMonCore core`. */
export function firstMember(source: string, name: string): string {
  const [first] = membersOf(stripComments(source), name)
  if (first === undefined) throw new Error(`the struct ${name} has no members`)
  return first
}
