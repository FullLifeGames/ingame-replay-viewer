// Where a member of a Pokémon's plain bytes sits and how a number, a move slot or a name goes in
// and out of it (#97), for pkm-fields.ts. A block's members sit in their block's chunk of the
// content buffer, the blocks in logical order. Pure: the layouts come in from
// build/gen5/bw2.json's `pkm`, the terminator from its `entry`.
import type { Bw2Numbers, FieldLayout, PkmNumbers } from './bw2-numbers.ts'
import { entryConstant } from './entry-field.ts'
import { nameUnits } from './game-string.ts'
import { BLOCKS, dataView, pkmField, pkmLayout } from './pkm-cipher.ts'

export interface PkmMove {
  move: number
  pp: number
  ppUps: number
}

/** The numbers the fields need: the format and the string terminator. */
export interface PkmFormat {
  pkm: PkmNumbers
  terminator: number
}

export const pkmFormat = (numbers: Pick<Bw2Numbers, 'pkm' | 'entry'>): PkmFormat => ({
  pkm: numbers.pkm,
  terminator: entryConstant(numbers.entry, 'CHAR_EOM'),
})

/** A name's unit is a halfword in the blocks. */
const UNIT = 2

/** A member's width in bits: a bitfield's own, a whole field's bytes. */
export const widthOf = (field: FieldLayout) => field.bits ?? field.size * 8

/** A member's place in the plain bytes: a block's members sit in their block's chunk. */
export function memberAt(pkm: PkmNumbers, struct: string, member: string): FieldLayout {
  const field = pkmField(pkm, struct, member)
  const block = BLOCKS.findIndex((name) => name === struct)
  if (block < 0) return field
  const content = pkmField(pkm, 'PartyPkm', 'base.contentBuffer').offset
  return {
    ...field,
    offset: content + block * pkmLayout(pkm, 'PkmBufferChunk').size + field.offset,
  }
}

function readWhole(bytes: Uint8Array, offset: number, size: number, name: string): number {
  const view = dataView(bytes)
  if (size === 1) return view.getUint8(offset)
  if (size === 2) return view.getUint16(offset, true)
  if (size === 4) return view.getUint32(offset, true)
  throw new RangeError(`${name} is no number of one, two or four bytes`)
}

function writeWhole(bytes: Uint8Array, at: { offset: number; size: number }, value: number) {
  const view = dataView(bytes)
  if (at.size === 1) view.setUint8(at.offset, value)
  else if (at.size === 2) view.setUint16(at.offset, value, true)
  else view.setUint32(at.offset, value, true)
}

/** The number in `field`: a whole field, or a bitfield out of its container. */
export function readNumber(bytes: Uint8Array, field: FieldLayout, name: string): number {
  const container = readWhole(bytes, field.offset, field.size, name)
  if (field.bits === undefined) return container
  return Math.floor(container / 2 ** (field.bit ?? 0)) % 2 ** field.bits
}

/** `value` into `field`, a bitfield's neighbours kept; throws naming the member when it does not
 * fit. The message carries no number, so a failure on the real format shows none. */
export function writeNumber(bytes: Uint8Array, field: FieldLayout, value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** widthOf(field)) {
    throw new RangeError(`${name} cannot hold the value written`)
  }
  const old = readNumber(bytes, field, name)
  const container = readWhole(bytes, field.offset, field.size, name)
  writeWhole(bytes, field, container + (value - old) * 2 ** (field.bit ?? 0))
}

/** The member's slots of `size` bytes each, for an array member. */
function slots(field: FieldLayout, count: number, name: string): FieldLayout[] {
  if (field.size % count !== 0) throw new RangeError(`${name} is no array of the move slots`)
  const size = field.size / count
  return Array.from({ length: count }, (_, i) => ({ offset: field.offset + i * size, size }))
}

/** The move slots of block B: their count is pp's size, a byte per slot. */
function moveSlots(pkm: PkmNumbers) {
  const at = (member: string) => memberAt(pkm, 'PkmBlockB', member)
  const count = at('pp').size
  return (['moves', 'pp', 'ppUps'] as const).map((m) => slots(at(m), count, `PkmBlockB.${m}`))
}

export function writeMoves(bytes: Uint8Array, pkm: PkmNumbers, moves: PkmMove[]) {
  const [move = [], pp = [], ppUps = []] = moveSlots(pkm)
  if (moves.length > move.length) throw new RangeError('PkmBlockB.moves holds fewer moves')
  move.forEach((_, i) => {
    const one = moves[i] ?? { move: 0, pp: 0, ppUps: 0 }
    writeNumber(bytes, move[i] as FieldLayout, one.move, 'PkmBlockB.moves')
    writeNumber(bytes, pp[i] as FieldLayout, one.pp, 'PkmBlockB.pp')
    writeNumber(bytes, ppUps[i] as FieldLayout, one.ppUps, 'PkmBlockB.ppUps')
  })
}

export function readMoves(bytes: Uint8Array, pkm: PkmNumbers): PkmMove[] {
  const [move = [], pp = [], ppUps = []] = moveSlots(pkm)
  const read = (slot: FieldLayout | undefined) => readNumber(bytes, slot as FieldLayout, 'move')
  return move.map((slot, i) => ({ move: read(slot), pp: read(pp[i]), ppUps: read(ppUps[i]) }))
}

/** `name` and its terminator into a block's name member; the units after the terminator stay. */
export function writeName(
  bytes: Uint8Array,
  format: PkmFormat,
  at: [string, string],
  name: string,
) {
  const field = memberAt(format.pkm, ...at)
  const units = nameUnits(
    name,
    { field: at.join('.'), room: field.size / UNIT, charWidth: UNIT },
    format.terminator,
  )
  ;[...units.kept, format.terminator].forEach((unit, i) => {
    writeWhole(bytes, { offset: field.offset + i * UNIT, size: UNIT }, unit)
  })
  return units.cut
}

/** The units of a name member up to its terminator, or to its room's end. */
export function readName(bytes: Uint8Array, format: PkmFormat, at: [string, string]): string {
  const field = memberAt(format.pkm, ...at)
  const units: number[] = []
  for (let i = 0; i < field.size / UNIT; i += 1) {
    const unit = readWhole(bytes, field.offset + i * UNIT, UNIT, at.join('.'))
    if (unit === format.terminator) break
    units.push(unit)
  }
  return String.fromCharCode(...units)
}
