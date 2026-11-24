import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import counts from '../tables/counts.json'
import trainerPics from '../tables/trainer-pics.json'
import { decodeStream } from './decode'
import { encodeInstruction, encodeStream } from './encode'
import {
  MON,
  MON_OFFSET,
  monOffset,
  OP,
  SIDE,
  STREAM,
  STREAM_OFFSET,
  TRAINER_OFFSET,
  trainerOffset,
} from './format'
import type { Instruction } from './instructions'
import { AFTER_LEADS, EACH_OP, LEADS, rawBytes, streamOf, streamWithLeads } from './testing'

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
    const rise = streamWithLeads([
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

  it('refuses versions 1, 2 and 4 (F7)', () => {
    for (const version of [1, 2, 4]) {
      expect(patched([END], 0, [version])).toThrow(
        `stream version ${String(version)} is unknown; this reads version 3`,
      )
    }
  })

  it('refuses a MOVE of size 4, as version 2 wrote it, and reads its animation turn', () => {
    const tables = encodeStream(streamWithLeads([END]))
    const end = tables.length - encodeInstruction(END).length
    const older = new Uint8Array([
      ...tables.subarray(0, end),
      ...[OP.move, 4, SIDE.near, SIDE.far, 1, 0],
      ...tables.subarray(end),
    ])
    new DataView(older.buffer).setUint32(
      STREAM_OFFSET.instructionsLength,
      older.length - STREAM.tablesEnd,
      true,
    )
    expect(() => decodeStream(older)).toThrow('move has size 4, not 5')
    const move: Instruction = { op: 'move', user: 'near', target: 'far', move: 1, animTurn: 0xff }
    expect(decodeStream(encodeStream(streamWithLeads([move, END])))).toEqual(
      streamWithLeads([move, END]),
    )
  })

  it('refuses an op with the wrong size (F7)', () => {
    const turn: Instruction = { op: 'turn', number: 1 }
    const at = STREAM.tablesEnd + 1
    expect(patched([turn, END], at, [3])).toThrow(/turn has size 3, not 2/)
    expect(patched([turn, END], at, [1])).toThrow(Gen3Error)
  })

  it('refuses an unknown op, the one after the last op of version 3', () => {
    expect(patched([END], STREAM.tablesEnd, [0x16])).toThrow(/op 22/)
  })

  it('refuses a header whose sizes or offsets are not those of version 3', () => {
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
    expect(patched([...LEADS, ability, END], AFTER_LEADS + 2 + 3, [2])).toThrow(/flag/)
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

  it('refuses a near trainer pic without a back pic, as the encoder does (#20)', () => {
    const pic = trainerOffset('near') + TRAINER_OFFSET.trainerPic
    const norman = trainerPics.TRAINER_PIC_LEADER_NORMAN
    expect(patched([END], pic, u16(norman))).toThrow(Gen3Error)
    expect(patched([END], pic, u16(norman))).toThrow(/near trainer pic \d+ has no back pic/)
    const steven = patched([END], pic, u16(trainerPics.TRAINER_PIC_STEVEN))()
    expect(steven.trainers.near.trainerPic).toBe(trainerPics.TRAINER_PIC_STEVEN)
  })

  it('refuses a far trainer pic without a front pic, as the encoder does (S3-2)', () => {
    const pic = trainerOffset('far') + TRAINER_OFFSET.trainerPic
    const pokedude = trainerPics.TRAINER_PIC_POKEDUDE
    expect(patched([END], pic, u16(pokedude))).toThrow(Gen3Error)
    expect(patched([END], pic, u16(pokedude))).toThrow(/far trainer pic \d+ has no front pic/)
    const steven = patched([END], pic, u16(trainerPics.TRAINER_PIC_STEVEN))()
    expect(steven.trainers.far.trainerPic).toBe(trainerPics.TRAINER_PIC_STEVEN)
  })

  it('reads a slot with species 0 as empty, whatever its other bytes, as the ROM does', () => {
    const decoded = patched([END], monOffset('far', 3) + MON_OFFSET.species, [0, 0])()
    expect(decoded.parties.far[3]).toBeNull()
    expect(decoded.parties.far[4]).not.toBeNull()
  })

  it('refuses a MOVE before any SEND_OUT, as the ROM does (#18)', () => {
    const move: Instruction = { op: 'move', user: 'near', target: 'far', move: 1, animTurn: 0 }
    expect(() => decodeStream(rawBytes([{ op: 'intro' }, move, END]))).toThrow(
      'move at 1 names the near side, which has no battler out',
    )
    expect(decodeStream(rawBytes([...LEADS, move, END]))).toEqual(streamWithLeads([move, END]))
  })

  it('refuses a side whose party holds no mon', () => {
    const empty = Array<number>(STREAM.partySize * MON.size).fill(0)
    expect(patched([END], monOffset('near', 0), empty)).toThrow(/the near party holds no mon/)
  })

  it('refuses a slot operand that names an empty slot', () => {
    // Each op after the instructions the order rules ask before it.
    const intro: Instruction = { op: 'intro' }
    const withdraw: Instruction = { op: 'withdraw', side: 'near' }
    const cases: [readonly Instruction[], Instruction][] = [
      [[intro], { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' }],
      [[...LEADS, withdraw], { op: 'switchIn', side: 'near', slot: 1, hp: 100, status: 'none' }],
      [[], { op: 'status', side: 'near', slot: 0, status: 'brn' }],
      [[], { op: 'item', side: 'near', slot: 1, item: 1 }],
    ]
    for (const [before, instruction] of cases) {
      const slot = STREAM.tablesEnd + before.flatMap(encodeInstruction).length + 3
      expect(patched([...before, instruction, END], slot, [2]), instruction.op).toThrow(
        new RegExp(`${instruction.op} names near slot 2, which holds no mon`),
      )
    }
    const operands = STREAM.tablesEnd + 2
    const ops = cases.map(([, instruction]) => instruction)
    const far = patched([{ ...ops[2], side: 'far' } as Instruction, END], operands + 1, [5])
    expect(far().instructions[0]).toEqual({ op: 'status', side: 'far', slot: 5, status: 'brn' })
  })

  it('refuses a move, ability, item or species number outside its range, as the ROM does', () => {
    const operands = AFTER_LEADS + 2
    const move: Instruction = { op: 'move', user: 'far', target: 'near', move: 1, animTurn: 0 }
    const ability: Instruction = { op: 'ability', side: 'near', ability: 1, show: true }
    const item: Instruction = { op: 'item', side: 'far', slot: 0, item: 1 }
    const change: Instruction = { op: 'formChange', side: 'near', species: 1 }
    const cases: [Instruction, number, number, RegExp][] = [
      [move, 2, counts.MOVES_COUNT_ALL, /move move 935/],
      [ability, 1, counts.ABILITIES_COUNT, /ability ability 320/],
      [item, 2, counts.ITEMS_COUNT, /item item 874/],
      [change, 1, counts.NUM_SPECIES, /formChange species 1573/],
    ]
    for (const [instruction, at, count, message] of cases) {
      expect(patched([...LEADS, instruction, END], operands + at, u16(count))).toThrow(message)
      const decoded = patched([...LEADS, instruction, END], operands + at, u16(count - 1))()
      expect(decoded.instructions[LEADS.length], instruction.op).toMatchObject({
        op: instruction.op,
      })
    }
    expect(patched([...LEADS, change, END], operands + 1, u16(0))).toThrow(/species 0 /)
  })

  it('refuses a name without EOS and a byte outside the charset', () => {
    const name = trainerOffset('near')
    expect(patched([END], name, Array<number>(20).fill(0xbb))).toThrow(/name has no EOS/)
    expect(patched([END], name, [10])).toThrow(/charset/)
    const nickname = monOffset('near', 0) + 8
    expect(patched([END], nickname, [10])).toThrow(/charset/)
  })
})
