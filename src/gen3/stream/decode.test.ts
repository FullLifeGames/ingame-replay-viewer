import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import { decodeStream } from './decode'
import { encodeStream } from './encode'
import { MON_OFFSET, monOffset, STREAM, STREAM_OFFSET, trainerOffset } from './format'
import type { Instruction } from './instructions'
import { EACH_OP, streamOf } from './testing'

const END: Instruction = { op: 'end', outcome: 'tie' }

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

  it('refuses version 2 (F7)', () => {
    expect(patched([END], 0, [2])).toThrow(/version 2/)
  })

  it('refuses an op with the wrong size (F7)', () => {
    const turn: Instruction = { op: 'turn', number: 1 }
    const at = STREAM.tablesEnd + 1
    expect(patched([turn, END], at, [3])).toThrow(/turn has size 3, not 2/)
    expect(patched([turn, END], at, [1])).toThrow(Gen3Error)
  })

  it('refuses an unknown op', () => {
    expect(patched([END], STREAM.tablesEnd, [0x12])).toThrow(/op 18/)
  })

  it('refuses a header that is not version 1', () => {
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
    expect(patched([END], maxHp, [0xff, 0x7f])).toThrow(/max HP 32767/)
    expect(patched([END], maxHp, [0xff, 0xff])).toThrow(/max HP 65535/)
  })

  it('refuses a name without EOS and a byte outside the charset', () => {
    const name = trainerOffset('near')
    expect(patched([END], name, Array<number>(20).fill(0xbb))).toThrow(/name has no EOS/)
    expect(patched([END], name, [10])).toThrow(/charset/)
    const nickname = monOffset('near', 0) + 8
    expect(patched([END], nickname, [10])).toThrow(/charset/)
  })
})
