import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import counts from '../tables/counts.json'
import trainerPics from '../tables/trainer-pics.json'
import { encodeInstruction, encodeStream } from './encode'
import { fieldSize } from './fields'
import { MON, MON_OFFSET, OP_SIZE, STREAM, TRAINER, TRAINER_OFFSET } from './format'
import {
  type Instruction,
  LAYOUT,
  MON_FIELDS,
  type StreamMon,
  TRAINER_FIELDS,
} from './instructions'
import { DUGTRIO, streamOf, streamWithLeads } from './testing'

const END: Instruction = { op: 'end', outcome: 'nearWon' }

const u16 = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
const u32 = (bytes: Uint8Array, at: number) => u16(bytes, at) + u16(bytes, at + 2) * 0x10000

describe('encodeStream', () => {
  it('starts a stream of END alone with version 3 and header size 16 (F1)', () => {
    const bytes = encodeStream(streamOf([END]))
    expect([...bytes.subarray(0, 4)]).toEqual([0x03, 0x00, 0x10, 0x00])
    expect([bytes[4], bytes[5], u16(bytes, 6)]).toEqual([24, 24, 0])
    expect([u32(bytes, 8), u32(bytes, 12)]).toEqual([STREAM.tablesEnd, 3])
    expect([...bytes.subarray(STREAM.tablesEnd)]).toEqual([0x00, 0x01, 0x00])
  })

  it('writes the trainers near first, names EOS-padded', () => {
    const bytes = encodeStream(streamOf([END]))
    const far = STREAM.trainersOffset + 24
    // "xXEricXx" in the game's charset, then EOS to the end of the 20-byte name.
    expect([...bytes.subarray(far, far + 9)]).toEqual([
      0xec, 0xd2, 0xbf, 0xe6, 0xdd, 0xd7, 0xd2, 0xec, 0xff,
    ])
    expect([...bytes.subarray(far + 9, far + 20)]).toEqual(Array<number>(11).fill(0xff))
    expect([u16(bytes, far + 20), bytes[far + 22], bytes[far + 23]]).toEqual([1, 6, 6])
  })

  it('writes a mon at its party slot and leaves an empty slot zero', () => {
    const bytes = encodeStream(streamOf([END]))
    const skarmory = STREAM.monsOffset + 6 * 24
    expect([u16(bytes, skarmory), u16(bytes, skarmory + 2)]).toEqual([227, 100])
    expect([bytes[skarmory + 4], bytes[skarmory + 5], bytes[skarmory + 6]]).toEqual([100, 1, 1])
    // "Machine Pass" with NBSP (0x39) for its space, then EOS.
    expect(bytes[skarmory + 8 + 7]).toBe(0x39)
    expect(bytes[skarmory + 8 + 12]).toBe(0xff)
    const empty = STREAM.monsOffset + 2 * 24
    expect([...bytes.subarray(empty, empty + 4 * 24)]).toEqual(Array<number>(96).fill(0))
  })

  it('refuses a stream that does not end with its one END', () => {
    expect(() => encodeStream(streamOf([]))).toThrow(Gen3Error)
    expect(() => encodeStream(streamOf([END, { op: 'intro' }]))).toThrow(/END/)
    expect(() => encodeStream(streamOf([END, END]))).toThrow(/END/)
  })

  it('refuses a MOVE before any SEND_OUT, as the ROM does (#18)', () => {
    const move: Instruction = { op: 'move', user: 'near', target: 'far', move: 1, animTurn: 0 }
    expect(() => encodeStream(streamOf([{ op: 'intro' }, move, END]))).toThrow(
      'move at 1 names the near side, which has no battler out',
    )
    expect(() => encodeStream(streamWithLeads([move, END]))).not.toThrow()
  })

  it('refuses a near trainer pic without a back pic, as the ROM will (#20)', () => {
    const stream = streamOf([END])
    const near = (trainerPic: number) => ({
      ...stream,
      trainers: { ...stream.trainers, near: { ...stream.trainers.near, trainerPic } },
    })
    expect(() => encodeStream(near(trainerPics.TRAINER_PIC_LEADER_NORMAN))).toThrow(
      `the near trainer pic ${String(trainerPics.TRAINER_PIC_LEADER_NORMAN)} has no back pic`,
    )
    expect(() => encodeStream(near(trainerPics.TRAINER_PIC_RED))).not.toThrow()
    const far = (trainerPic: number) => ({
      ...stream,
      trainers: { ...stream.trainers, far: { ...stream.trainers.far, trainerPic } },
    })
    expect(() => encodeStream(far(trainerPics.TRAINER_PIC_LEADER_NORMAN))).not.toThrow()
  })

  it('refuses a far trainer pic without a front pic, as the ROM will (S3-2)', () => {
    const stream = streamOf([END])
    const far = (trainerPic: number) => ({
      ...stream,
      trainers: { ...stream.trainers, far: { ...stream.trainers.far, trainerPic } },
    })
    expect(() => encodeStream(far(trainerPics.TRAINER_PIC_POKEDUDE))).toThrow(
      `the far trainer pic ${String(trainerPics.TRAINER_PIC_POKEDUDE)} has no front pic`,
    )
    expect(() => encodeStream(far(trainerPics.TRAINER_PIC_OLD_MAN))).toThrow(/has no front pic/)
    expect(() => encodeStream(far(trainerPics.TRAINER_PIC_STEVEN))).not.toThrow()
  })

  it('refuses a party that is not six slots', () => {
    const stream = streamOf([END])
    const parties = { ...stream.parties, near: [DUGTRIO] }
    expect(() => encodeStream({ ...stream, parties })).toThrow(/party/)
  })

  it('refuses an empty side, a slot operand on an empty slot and a mon of species 0', () => {
    const stream = streamOf([END])
    const empty = { ...stream.parties, far: Array<null>(6).fill(null) }
    expect(() => encodeStream({ ...stream, parties: empty })).toThrow(/far party holds no mon/)
    const item: Instruction = { op: 'item', side: 'near', slot: 4, item: 1 }
    expect(() => encodeStream(streamOf([item, END]))).toThrow(/item names near slot 4/)
    const none = {
      ...stream.parties,
      near: [{ ...DUGTRIO, species: 0 }, ...stream.parties.near.slice(1)],
    }
    expect(() => encodeStream({ ...stream, parties: none })).toThrow(/species 0 is outside 1/)
  })

  it('refuses a nickname over 12 glyphs and a trainer name over 19', () => {
    const stream = streamOf([END])
    const long: StreamMon = { ...DUGTRIO, nickname: 'MachinePassag' }
    const parties = { ...stream.parties, far: [long, null, null, null, null, null] }
    expect(() => encodeStream({ ...stream, parties })).toThrow(/nickname/)
    const trainers = { ...stream.trainers, near: { ...stream.trainers.near, name: 'A'.repeat(20) } }
    expect(() => encodeStream({ ...stream, trainers })).toThrow(/name/)
    const unnamed = { ...DUGTRIO, nickname: 7 as unknown as string }
    const blank = { ...stream.parties, near: [unnamed, null, null, null, null, null] }
    expect(() => encodeStream({ ...stream, parties: blank })).toThrow(/nickname is not a text/)
  })
})

describe('the layouts', () => {
  it('fill each fixed op to its OP_SIZE', () => {
    for (const [op, fields] of Object.entries(LAYOUT)) {
      const size = fields.reduce((sum, [, kind]) => sum + fieldSize(kind), 0)
      expect([op, size]).toEqual([op, OP_SIZE[op as keyof typeof OP_SIZE]])
    }
  })

  it('end each table field where the next offset starts', () => {
    const tables = [
      [TRAINER_FIELDS, TRAINER_OFFSET, TRAINER.size],
      [MON_FIELDS, MON_OFFSET, MON.size],
    ] as const
    for (const [fields, offsets, size] of tables) {
      const starts: [string, number][] = Object.entries(offsets)
      for (const [name, kind] of fields) {
        const at = starts.findIndex(([key]) => key === name)
        const next = starts[at + 1]?.[1] ?? size
        expect([name, (starts[at]?.[1] ?? NaN) + fieldSize(kind)]).toEqual([name, next])
      }
    }
  })
})

describe('encodeInstruction', () => {
  it('encodes TURN 300 as 01 02 2C 01 (F2)', () => {
    expect(encodeInstruction({ op: 'turn', number: 300 })).toEqual([0x01, 0x02, 0x2c, 0x01])
  })

  it('encodes PRINT "Go! Dugtrio!" as 02 0D, the charset bytes and EOS (F3)', () => {
    expect(encodeInstruction({ op: 'print', text: 'Go! Dugtrio!' })).toEqual([
      0x02, 0x0d, 0xc1, 0xe3, 0xab, 0x00, 0xbe, 0xe9, 0xdb, 0xe8, 0xe6, 0xdd, 0xe3, 0xab, 0xff,
    ])
  })

  it('takes a 254-glyph text and refuses a 255-glyph one (F4)', () => {
    expect(encodeInstruction({ op: 'print', text: 'a'.repeat(254) })).toHaveLength(2 + 255)
    expect(() => encodeInstruction({ op: 'print', text: 'a'.repeat(255) })).toThrow(Gen3Error)
    expect(() => encodeInstruction({ op: 'print', text: '' })).toThrow(/PRINT/)
  })

  it('refuses a character outside the charset, line breaks included', () => {
    expect(() => encodeInstruction({ op: 'print', text: 'Hi 😀' })).toThrow(/😀/)
    expect(() => encodeInstruction({ op: 'print', text: 'a\nb' })).toThrow(Gen3Error)
  })

  it('writes signed stages, and a two-byte move with its animation turn', () => {
    const stat: Instruction = { op: 'stat', side: 'far', stat: 'atk', stages: -1, arrows: 'one' }
    expect(encodeInstruction(stat)).toEqual([0x0c, 4, 1, 1, 0xff, 1])
    const move: Instruction = { op: 'move', user: 'near', target: 'far', move: 0x0312, animTurn: 2 }
    expect(encodeInstruction(move)).toEqual([0x07, 5, 0, 1, 0x12, 0x03, 2])
  })

  it('encodes the ops of version 2: ITEM_POPUP, TRAP_TURN, FLUSH_TEXT_BOX, ANIM SIMPLE_HEAL', () => {
    const popUp: Instruction = { op: 'itemPopUp', side: 'far', item: 0x0123 }
    expect(encodeInstruction(popUp)).toEqual([0x12, 3, 1, 0x23, 0x01])
    const trap: Instruction = { op: 'trapTurn', side: 'near', move: 83 }
    expect(encodeInstruction(trap)).toEqual([0x13, 3, 0, 83, 0])
    expect(encodeInstruction({ op: 'flushTextBox' })).toEqual([0x14, 0])
    const heal: Instruction = { op: 'anim', side: 'far', anim: 'simpleHeal' }
    expect(encodeInstruction(heal)).toEqual([0x0d, 2, 1, 17])
  })

  it('takes the last item and move of the expansion and refuses the next', () => {
    const item = (number: number): Instruction => ({ op: 'itemPopUp', side: 'near', item: number })
    const move = (number: number): Instruction => ({ op: 'trapTurn', side: 'far', move: number })
    expect(encodeInstruction(item(counts.ITEMS_COUNT - 1))).toHaveLength(5)
    expect(encodeInstruction(move(counts.MOVES_COUNT_ALL - 1))).toHaveLength(5)
    expect(() => encodeInstruction(item(counts.ITEMS_COUNT))).toThrow(Gen3Error)
    expect(() => encodeInstruction(move(counts.MOVES_COUNT_ALL))).toThrow(Gen3Error)
  })

  it('refuses operands out of their range', () => {
    const cases: Instruction[] = [
      { op: 'turn', number: 0x10000 },
      { op: 'turn', number: 1.5 },
      { op: 'hp', side: 'near', hp: -1 },
      { op: 'status', side: 'near', slot: 6, status: 'brn' },
      { op: 'stat', side: 'near', stat: 'def', stages: 128, arrows: 'none' },
      { op: 'weather', weather: 'fog' as 'rain' },
      { op: 'volatile', side: 'near', volatile: 'substitute', on: 1 as unknown as boolean },
      { op: 'move', user: 'near', target: 'far', move: 0x1234, animTurn: 0 },
      { op: 'move', user: 'near', target: 'far', move: 1, animTurn: 0x100 },
      { op: 'move', user: 'near', target: 'far', move: 1, animTurn: -1 },
      { op: 'item', side: 'far', slot: 0, item: 'Leftovers' as unknown as number },
      { op: 'itemPopUp', side: 'far', item: 1.5 },
      { op: 'trapTurn', side: 'top' as 'near', move: 83 },
      { op: 'anim', side: 'near', anim: 'simpleHeal2' as 'simpleHeal' },
    ]
    for (const instruction of cases) {
      expect(() => encodeInstruction(instruction), instruction.op).toThrow(Gen3Error)
    }
  })
})
