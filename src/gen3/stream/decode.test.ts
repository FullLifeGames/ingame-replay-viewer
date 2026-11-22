import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import counts from '../tables/counts.json'
import { decodeStream } from './decode'
import { encodeStream } from './encode'
import {
  MON,
  MON_OFFSET,
  monOffset,
  STREAM,
  STREAM_OFFSET,
  TRAINER_OFFSET,
  trainerOffset,
} from './format'
import type { Instruction } from './instructions'
import { EACH_OP, streamOf } from './testing'

const END: Instruction = { op: 'end', outcome: 'tie' }

/** A u16 as its two bytes, little-endian. */
const u16 = (value: number) => [value & 0xff, value >> 8]

/** Decoding a stream with `instructions` whose bytes from `at` are set to `values`. */
function patched(instructions: readonly Instruction[], at: number, values: readonly number[]) {
  const bytes = encodeStream(streamOf(instructions))
  bytes.set(values, at)
  return () => decodeStream(bytes)
}

describe('decodeStream', () => {
  it('reads back one instruction of each op and full team tables (F5)', () => {
    const stream = streamOf(EACH_OP)
    expect(decodeStream(encodeStream(stream))).toEqual(stream)
    const rise = streamOf([
      { op: 'stat', side: 'near', stat: 'spe', stages: 6, arrows: 'one' },
      END,
    ])
    expect(decodeStream(encodeStream(rise))).toEqual(rise)
  })

  it('reads a stream inside a larger buffer', () => {
    const bytes = encodeStream(streamOf([END]))
    const slot = new Uint8Array(bytes.length + 8)
    slot.set(bytes, 8)
    expect(decodeStream(slot.subarray(8, 8 + bytes.length))).toEqual(streamOf([END]))
  })

  it('refuses versions 1 and 3 (F7)', () => {
    expect(patched([END], 0, [1])).toThrow('stream version 1 is unknown; this reads version 2')
    expect(patched([END], 0, [3])).toThrow('stream version 3 is unknown; this reads version 2')
  })

  it('refuses an op with the wrong size (F7)', () => {
    const turn: Instruction = { op: 'turn', number: 1 }
    const at = STREAM.tablesEnd + 1
    expect(patched([turn, END], at, [3])).toThrow(/turn has size 3, not 2/)
    expect(patched([turn, END], at, [1])).toThrow(Gen3Error)
  })

  it('refuses an unknown op, the one after the last op of version 2', () => {
    expect(patched([END], STREAM.tablesEnd, [0x14])).toThrow(/op 20/)
  })

  it('refuses a header whose sizes or offsets are not those of version 2', () => {
    const cases: [number, number][] = [
      [STREAM_OFFSET.headerSize, 0x20],
      [STREAM_OFFSET.trainerSize, 25],
      [STREAM_OFFSET.monSize, 23],
      [STREAM_OFFSET.instructionsOffset, 0x10],
      [STREAM_OFFSET.instructionsLength, 4],
    ]
    for (const [offset, value] of cases) {
      expect(patched([END], offset, [value]), String(offset)).toThrow(Gen3Error)
    }
    expect(() => decodeStream(new Uint8Array(4))).toThrow(/bytes/)
  })

  it('refuses a stream without END at its end', () => {
    const length = STREAM_OFFSET.instructionsLength
    expect(patched([END], length, [0])).toThrow(/END/)
    expect(patched([{ op: 'turn', number: 7 }, END], length, [4])).toThrow(/END/)
  })

  it('refuses instructions cut short and bytes after END', () => {
    const length = STREAM_OFFSET.instructionsLength
    expect(patched([{ op: 'turn', number: 7 }, END], length, [3])).toThrow(/short/)
    expect(patched([END], length, [1])).toThrow(/short/)
    const bytes = encodeStream(streamOf([END]))
    const longer = new Uint8Array(bytes.length + 3)
    longer.set(bytes)
    longer.set([0x01, 0x01, 0x00], bytes.length)
    longer.set([6], length)
    expect(() => decodeStream(longer)).toThrow(/after END/)
  })

  it('refuses a PRINT whose EOS is missing, early or alone', () => {
    const print: Instruction = { op: 'print', text: 'Hi' }
    const text = STREAM.tablesEnd + 2
    expect(patched([print, END], text + 2, [0xbb])).toThrow(/PRINT/)
    expect(patched([print, END], text, [0xff])).toThrow(/PRINT/)
    expect(patched([print, END], text - 1, [1, 0xff])).toThrow(/PRINT/)
  })

  it('refuses operands outside their enum, slot or flag', () => {
    const status: Instruction = { op: 'status', side: 'far', slot: 0, status: 'brn' }
    const ability: Instruction = { op: 'ability', side: 'near', ability: 1, show: true }
    const operands = STREAM.tablesEnd + 2
    expect(patched([status, END], operands + 2, [7])).toThrow(/enum/)
    expect(patched([status, END], operands + 1, [6])).toThrow(/slot/)
    expect(patched([ability, END], operands + 3, [2])).toThrow(/flag/)
  })

  it('refuses a max HP the game bar cannot drop to, as the ROM does (0x7FFF and up)', () => {
    const maxHp = monOffset('far', 2) + MON_OFFSET.maxHp
    expect(patched([END], maxHp, [0xfe, 0x7f])().parties.far[2]?.maxHp).toBe(0x7ffe)
    expect(patched([END], maxHp, [0xff, 0x7f])).toThrow(/maxHp 32767/)
    expect(patched([END], maxHp, [0xff, 0xff])).toThrow(/maxHp 65535/)
    expect(MON.maxHpLimit).toBe(0x7fff)
  })

  it('refuses a max HP of 0 and a level outside 1 to MAX_LEVEL, as the ROM does', () => {
    const mon = monOffset('far', 2)
    expect(patched([END], mon + MON_OFFSET.maxHp, [0, 0])).toThrow(/far mon 2 maxHp 0/)
    expect(patched([END], mon + MON_OFFSET.level, [0])).toThrow(/level 0/)
    expect(patched([END], mon + MON_OFFSET.level, [counts.MAX_LEVEL + 1])).toThrow(/level 101/)
    expect(patched([END], mon + MON_OFFSET.level, [200])).toThrow(/level 200/)
    expect(patched([END], mon + MON_OFFSET.level, [1])().parties.far[2]?.level).toBe(1)
  })

  it('refuses a species at or above NUM_SPECIES and a trainer pic at or above its count', () => {
    const species = monOffset('near', 0) + MON_OFFSET.species
    const last = counts.NUM_SPECIES - 1
    expect(patched([END], species, u16(last))().parties.near[0]?.species).toBe(last)
    expect(patched([END], species, u16(counts.NUM_SPECIES))).toThrow(/species 1573/)
    expect(patched([END], species, [0xff, 0xff])).toThrow(/species 65535/)
    const pic = trainerOffset('far') + TRAINER_OFFSET.trainerPic
    expect(patched([END], pic, u16(counts.TRAINER_PIC_COUNT))).toThrow(/trainerPic 158/)
  })

  it('reads a slot with species 0 as empty, whatever its other bytes, as the ROM does', () => {
    const decoded = patched([END], monOffset('far', 3) + MON_OFFSET.species, [0, 0])()
    expect(decoded.parties.far[3]).toBeNull()
    expect(decoded.parties.far[4]).not.toBeNull()
  })

  it('refuses a side whose party holds no mon', () => {
    const empty = Array<number>(STREAM.partySize * MON.size).fill(0)
    expect(patched([END], monOffset('near', 0), empty)).toThrow(/the near party holds no mon/)
  })

  it('refuses a slot operand that names an empty slot', () => {
    const operands = STREAM.tablesEnd + 2
    const ops: readonly Instruction[] = [
      { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
      { op: 'switchIn', side: 'near', slot: 1, hp: 100, status: 'none' },
      { op: 'status', side: 'near', slot: 0, status: 'brn' },
      { op: 'item', side: 'near', slot: 1, item: 1 },
    ]
    for (const instruction of ops) {
      expect(patched([instruction, END], operands + 1, [2]), instruction.op).toThrow(
        new RegExp(`${instruction.op} names near slot 2, which holds no mon`),
      )
    }
    const far = patched([{ ...ops[2], side: 'far' } as Instruction, END], operands + 1, [5])
    expect(far().instructions[0]).toEqual({ op: 'status', side: 'far', slot: 5, status: 'brn' })
  })

  it('refuses a move, ability or item number at or above its count, as the ROM does', () => {
    const operands = STREAM.tablesEnd + 2
    const move: Instruction = { op: 'move', user: 'far', target: 'near', move: 1 }
    const ability: Instruction = { op: 'ability', side: 'near', ability: 1, show: true }
    const item: Instruction = { op: 'item', side: 'far', slot: 0, item: 1 }
    const cases: [Instruction, number, number, RegExp][] = [
      [move, 2, counts.MOVES_COUNT_ALL, /move move 935/],
      [ability, 1, counts.ABILITIES_COUNT, /ability ability 320/],
      [item, 2, counts.ITEMS_COUNT, /item item 874/],
    ]
    for (const [instruction, at, count, message] of cases) {
      expect(patched([instruction, END], operands + at, u16(count))).toThrow(message)
      const decoded = patched([instruction, END], operands + at, u16(count - 1))()
      expect(decoded.instructions[0], instruction.op).toMatchObject({ op: instruction.op })
    }
  })

  it('refuses a name without EOS and a byte outside the charset', () => {
    const name = trainerOffset('near')
    expect(patched([END], name, Array<number>(20).fill(0xbb))).toThrow(/name has no EOS/)
    expect(patched([END], name, [10])).toThrow(/charset/)
    const nickname = monOffset('near', 0) + 8
    expect(patched([END], nickname, [10])).toThrow(/charset/)
  })
})
