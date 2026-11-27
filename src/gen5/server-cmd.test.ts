import { describe, expect, it } from 'vitest'

import type { ArgFormat, ArgPut, ServerCmdTable } from './bw2-numbers'
import { packCommands } from './server-cmd'

// An invented table: command numbers above any the game has, format codes and bit layouts of its
// own, in the kinds of put the queue's packer writes (a byte, a halfword, a word, bits packed into
// three bytes, two halfwords, a loop of bytes), and an invented end marker. The expected bytes are worked out by hand, high byte first as the queue's
// PutU16, PutU24 and PutU32 write them.
const plain = (arg: number, bytes: number): ArgPut => ({
  bytes,
  fields: [{ arg, mask: 2 ** (bytes * 8) - 1, shift: 0 }],
})
const format = (code: number, argCount: number, puts: ArgPut[]): ArgFormat => ({
  code,
  argCount,
  puts,
})

const TABLE: ServerCmdTable = {
  serverCommands: {
    CMD_NONE: 0x0100,
    CMD_HP_DOWN: 0x0107,
    CMD_ANIM: 0x0131,
    CMD_GAUGE: 0x0151,
    CMD_SPLIT: 0x0122,
    CMD_SIX: 0x0123,
    CMD_WORD: 0x0124,
    CMD_SAY: 0x0140,
    CMD_SAY_LOUD: 0x0141,
    CMD_SAY_SET_SE: 0x0142,
  },
  argFormats: {
    ARGS_NONE: format(0x70, 0, []),
    ARGS_MSG_SE: format(0x60, 0, []),
    ARGS_U8: format(0x51, 1, [plain(0, 1)]),
    ARGS_U8_U16: format(0x72, 2, [plain(0, 1), plain(1, 2)]),
    ARGS_U8_U32: format(0x62, 2, [plain(0, 1), plain(1, 4)]),
    // 6, 6 and 12 bits in three bytes, then a byte.
    ARGS_6_6_12_U8: format(0x64, 4, [
      {
        bytes: 3,
        fields: [
          { arg: 1, mask: 0x3f, shift: 12 },
          { arg: 0, mask: 0x3f, shift: 18 },
          { arg: 2, mask: 0xfff, shift: 0 },
        ],
      },
      plain(3, 1),
    ]),
    // Two bytes written as two halfwords, then a halfword.
    ARGS_HALVES: format(0x75, 3, [
      { bytes: 2, fields: [{ arg: 0, mask: 0x3f, shift: 2 }] },
      { bytes: 2, fields: [{ arg: 1, mask: 3, shift: 0 }] },
      plain(2, 2),
    ]),
    ARGS_U8X3: format(0x53, 3, [plain(0, 1), plain(1, 1), plain(2, 1)]),
  },
  commandFormats: {
    CMD_NONE: 'ARGS_NONE',
    CMD_HP_DOWN: 'ARGS_U8_U16',
    CMD_ANIM: 'ARGS_6_6_12_U8',
    CMD_GAUGE: 'ARGS_U8',
    CMD_SPLIT: 'ARGS_HALVES',
    CMD_SIX: 'ARGS_U8X3',
    CMD_WORD: 'ARGS_U8_U32',
    CMD_SAY: 'ARGS_NONE',
    CMD_SAY_LOUD: 'ARGS_MSG_SE',
    CMD_SAY_SET_SE: 'ARGS_MSG_SE',
  },
  messages: {
    formats: ['ARGS_NONE', 'ARGS_MSG_SE'],
    soundCommand: 'CMD_SAY_LOUD',
    argEnd: 0x7eed0000,
  },
}

const pack = (...commands: Parameters<typeof packCommands>[1]) => [...packCommands(TABLE, commands)]

// Scene: the client reads each argument from the bytes where the server's queue would put it.
describe('packCommands', () => {
  it('writes the command as a halfword and a byte and a halfword after it', () => {
    expect(pack({ command: 'CMD_HP_DOWN', args: [2, 0x1234] })).toEqual([
      0x01, 0x07, 0x02, 0x12, 0x34,
    ])
  })

  it('writes a word high byte first', () => {
    expect(pack({ command: 'CMD_WORD', args: [1, 0x89abcdef] })).toEqual([
      0x01, 0x24, 0x01, 0x89, 0xab, 0xcd, 0xef,
    ])
  })

  it('packs 6, 6 and 12 bits into three bytes, the first argument highest', () => {
    // (3 << 18) | (1 << 12) | 0x0123 = 0x0c1123, then the byte 7.
    expect(pack({ command: 'CMD_ANIM', args: [3, 1, 0x0123, 7] })).toEqual([
      0x01, 0x31, 0x0c, 0x11, 0x23, 0x07,
    ])
  })

  it('writes two halfwords for two packed bytes, and a loop as bytes', () => {
    expect(pack({ command: 'CMD_SPLIT', args: [0x3f, 3, 0x0200] })).toEqual([
      0x01, 0x22, 0x00, 0xfc, 0x00, 0x03, 0x02, 0x00,
    ])
    expect(pack({ command: 'CMD_SIX', args: [4, 5, 6] })).toEqual([0x01, 0x23, 4, 5, 6])
  })

  it('puts commands one after the other in one block', () => {
    expect(
      pack({ command: 'CMD_GAUGE', args: [1] }, { command: 'CMD_HP_DOWN', args: [1, 60] }),
    ).toEqual([0x01, 0x51, 0x01, 0x01, 0x07, 0x01, 0x00, 0x3c])
  })

  it('ends a message command with the end marker', () => {
    expect(pack({ command: 'CMD_SAY', message: 0x0123, args: [1] })).toEqual([
      0x01, 0x40, 0x01, 0x23, 0x00, 0x00, 0x00, 0x01, 0x7e, 0xed, 0x00, 0x00,
    ])
    expect(pack({ command: 'CMD_SAY_SET_SE', message: 2, args: [] })).toEqual([
      0x01, 0x42, 0x00, 0x02, 0x7e, 0xed, 0x00, 0x00,
    ])
  })

  it('writes the sound before the arguments for the sound command only', () => {
    expect(pack({ command: 'CMD_SAY_LOUD', message: 3, sound: 0x0567, args: [] })).toEqual([
      0x01, 0x41, 0x00, 0x03, 0x05, 0x67, 0x7e, 0xed, 0x00, 0x00,
    ])
    expect(() => pack({ command: 'CMD_SAY_LOUD', message: 3, args: [] })).toThrow(
      /CMD_SAY_LOUD.*sound/,
    )
    expect(() => pack({ command: 'CMD_SAY', message: 3, sound: 1, args: [] })).toThrow(
      /CMD_SAY.*sound/,
    )
  })

  it('throws on an unknown command', () => {
    expect(() => pack({ command: 'CMD_DANCE', args: [] })).toThrow(/CMD_DANCE/)
  })

  it('throws on a wrong argument count and on a message where none goes, or none where one goes', () => {
    expect(() => pack({ command: 'CMD_HP_DOWN', args: [1] })).toThrow(/CMD_HP_DOWN.*2.*1/)
    expect(() => pack({ command: 'CMD_GAUGE', message: 1, args: [1] })).toThrow(
      /CMD_GAUGE.*message/,
    )
    expect(() => pack({ command: 'CMD_SAY', args: [] })).toThrow(/CMD_SAY.*message/)
  })

  // Scene: an HP of 70000 must not reach the game as 4464.
  it('throws on an argument wider than its field, never cutting it', () => {
    expect(() => pack({ command: 'CMD_HP_DOWN', args: [1, 70000] })).toThrow(
      /CMD_HP_DOWN.*argument 1.*70000/,
    )
    expect(() => pack({ command: 'CMD_ANIM', args: [64, 0, 0, 0] })).toThrow(/argument 0/)
    expect(() => pack({ command: 'CMD_GAUGE', args: [-1] })).toThrow(/argument 0/)
    expect(() => pack({ command: 'CMD_GAUGE', args: [1.5] })).toThrow(/argument 0/)
  })

  it('throws on a message argument that equals the end marker or is no word', () => {
    expect(() => pack({ command: 'CMD_SAY', message: 1, args: [0x7eed0000] })).toThrow(/end/)
    expect(() => pack({ command: 'CMD_SAY', message: 1, args: [2 ** 32] })).toThrow(/argument 0/)
    expect(() => pack({ command: 'CMD_SAY', message: 0x10000, args: [] })).toThrow(/message/)
  })
})

// Scene: the server sends a hit's flash with each target's mon ID as one byte after the
// command's arguments (BtlServerCmdQueue_PutByte), and the client reads them in that order.
describe('packCommands with trailing bytes', () => {
  it('writes each trailing byte after the arguments, in order', () => {
    expect(pack({ command: 'CMD_SIX', args: [1, 2, 3], bytes: [0x0d, 0xfe] })).toEqual([
      0x01, 0x23, 1, 2, 3, 0x0d, 0xfe,
    ])
    expect(
      pack(
        { command: 'CMD_HP_DOWN', args: [1, 60], bytes: [] },
        { command: 'CMD_GAUGE', args: [1] },
      ),
    ).toEqual([0x01, 0x07, 0x01, 0x00, 0x3c, 0x01, 0x51, 0x01])
  })

  it('throws by name on a trailing byte past 255, never cutting it', () => {
    expect(() => pack({ command: 'CMD_SIX', args: [1, 2, 3], bytes: [4, 256] })).toThrow(
      /CMD_SIX.*byte 1.*256/,
    )
    expect(() => pack({ command: 'CMD_GAUGE', args: [1], bytes: [-1] })).toThrow(
      /CMD_GAUGE.*byte 0/,
    )
  })

  it('refuses trailing bytes on a message command', () => {
    expect(() => pack({ command: 'CMD_SAY', message: 1, args: [], bytes: [2] })).toThrow(
      /CMD_SAY.*trailing bytes/,
    )
  })
})
