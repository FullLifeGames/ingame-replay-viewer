import { beforeAll, describe, expect, it } from 'vitest'

import type { ArgFormat } from '../src/gen5/bw2-numbers'
import { parseArgFormats, parseMessageRules } from './gen5-bw2-put'

// Invented C for the spec: the features the readers need (a switch of puts by format, a loop of
// puts, a conditional extra halfword, a loop of words up to an end marker) in an order and with
// names of its own. No line comes from pokebw2.
const PACKER = `
static void PutCmdArgs(Queue *q, Cmd code, int shape, const u32 *vals);

static void PutCmdArgs(Queue *q, Cmd code, int shape, const u32 *vals) {
    int n;

    PutU16(q, code);
    switch (shape) {
    case FMT_U8X3:
        for (n = 0; n < 3; ++n) {
            PutU8(q, vals[n]);
        }
        break;
    case FMT_HALVES:
        PutHalfwords(q, (u8)((vals[0] & 0x3f) << 2), (u8)(vals[1] & 3));
        PutU16(q, vals[2]);
        break;
    case FMT_4_4_16:
        PutU24(q, (vals[2] & 0xffff) | ((vals[0] & 0xf) << 20) | ((vals[1] & 0xf) << 16));
        break;
    case FMT_6_2:
        PutU8(q, (vals[1] & 3) | ((vals[0] & 0x3f) << 2));
        break;
    case FMT_U8_U32:
        PutU8(q, vals[0]);
        PutU32(q, vals[1]);
        break;
    case FMT_NONE:
        break;
    }
}
`

const CODES = {
  FMT_NONE: 0x70,
  FMT_MSG: 0x60,
  FMT_U8_U32: 0x52,
  FMT_6_2: 0x72,
  FMT_4_4_16: 0x63,
  FMT_HALVES: 0x73,
  FMT_U8X3: 0x43,
}

const all = (bytes: number) => 2 ** (bytes * 8) - 1

// Scene: the packer writes each argument where the game's reader looks for it.
describe('parseArgFormats', () => {
  let formats: Record<string, ArgFormat> = {}
  beforeAll(() => {
    formats = parseArgFormats(PACKER, CODES, ['FMT_NONE', 'FMT_MSG'])
  })

  it('reads plain puts, high byte first, with the full width as mask', () => {
    expect(formats.FMT_U8_U32).toEqual({
      code: 0x52,
      argCount: 2,
      puts: [
        { bytes: 1, fields: [{ arg: 0, mask: all(1), shift: 0 }] },
        { bytes: 4, fields: [{ arg: 1, mask: all(4), shift: 0 }] },
      ],
    })
  })

  it('reads bits packed into one put, each with its mask and shift', () => {
    expect(formats.FMT_6_2?.puts).toEqual([
      {
        bytes: 1,
        fields: [
          { arg: 1, mask: 3, shift: 0 },
          { arg: 0, mask: 0x3f, shift: 2 },
        ],
      },
    ])
    expect(formats.FMT_4_4_16?.puts).toEqual([
      {
        bytes: 3,
        fields: [
          { arg: 2, mask: 0xffff, shift: 0 },
          { arg: 0, mask: 0xf, shift: 20 },
          { arg: 1, mask: 0xf, shift: 16 },
        ],
      },
    ])
  })

  it('reads two halfwords as two 2-byte puts, and a loop as one put per turn', () => {
    expect(formats.FMT_HALVES?.puts.map((put) => put.bytes)).toEqual([2, 2, 2])
    expect(formats.FMT_HALVES?.puts[0]?.fields).toEqual([{ arg: 0, mask: 0x3f, shift: 2 }])
    expect(formats.FMT_U8X3).toEqual({
      code: 0x43,
      argCount: 3,
      puts: [0, 1, 2].map((arg) => ({ bytes: 1, fields: [{ arg, mask: 0xff, shift: 0 }] })),
    })
  })

  it('gives an empty format no puts and a message format none either', () => {
    expect(formats.FMT_NONE).toEqual({ code: 0x70, argCount: 0, puts: [] })
    expect(formats.FMT_MSG).toEqual({ code: 0x60, argCount: 0, puts: [] })
  })

  it('throws when the low nibble and the arguments used disagree', () => {
    expect(() =>
      parseArgFormats(PACKER, { ...CODES, FMT_6_2: 0x73 }, ['FMT_NONE', 'FMT_MSG']),
    ).toThrow(/FMT_6_2.*3.*2/)
  })

  it('throws on a statement it cannot read, a field past its put, and a format with no case', () => {
    const odd = PACKER.replace(
      'PutU8(q, vals[0]);\n        PutU32',
      'PutBits(q, vals[0]);\n        PutU32',
    )
    expect(() => parseArgFormats(odd, CODES, ['FMT_NONE', 'FMT_MSG'])).toThrow(/PutBits/)
    const wide = PACKER.replace('(vals[0] & 0x3f) << 2))', '(vals[0] & 0x3f) << 3))')
    expect(() => parseArgFormats(wide, CODES, ['FMT_NONE', 'FMT_MSG'])).toThrow(/FMT_6_2/)
    expect(() => parseArgFormats(PACKER, CODES, ['FMT_NONE'])).toThrow(/FMT_MSG/)
    const narrow = PACKER.replace('PutU16(q, code);', 'PutU8(q, code);')
    expect(() => parseArgFormats(narrow, CODES, ['FMT_NONE', 'FMT_MSG'])).toThrow(/halfword/)
  })
})

const READER = `
u16 BtlServerCmdQueue_Read(Queue *q, u32 *out) {
    u16 cmd = TakeU16(q);
    u8 shape;

    shape = sShapes[cmd];
    if (shape != FMT_NONE && shape != FMT_MSG) {
        TakeArgs(q, shape, out);
        return cmd;
    }
    TakeMsg(q, cmd, out);
    return cmd;
}
`

const WRITER = `
void BtlServerCmdQueue_PutMsg(Queue *q, u8 cmd, ...) {
    va_list ap;
    u16 text;
    u32 word;

    va_start(ap, cmd);
    text = (u16)va_arg(ap, u32);
    PutU16(q, cmd);
    PutU16(q, text);
    if (cmd == CMD_SAY_LOUD) {
        u16 tune = (u16)va_arg(ap, u32);
        PutU16(q, tune);
    }
    do {
        word = va_arg(ap, u32);
        PutU32(q, word);
    } while (word != WORDS_DONE);
    va_end(ap);
}
`
const END = 0x7eed0000
const rules = (reader: string, writer: string) => parseMessageRules(reader + writer, END)

// Scene: a message command carries its end marker, and only one command carries a sound.
describe('parseMessageRules', () => {
  it('reads the message formats from the reader and the sound command from the writer', () => {
    expect(rules(READER, WRITER)).toEqual({
      formats: ['FMT_NONE', 'FMT_MSG'],
      soundCommand: 'CMD_SAY_LOUD',
      argEnd: END,
    })
  })

  it('throws when the reader takes no format from a table', () => {
    const odd = READER.replace('shape = sShapes[cmd];', 'shape = TakeU8(q);')
    expect(() => rules(odd, WRITER)).toThrow(/_Read.*format/)
  })

  it('throws when the writer does not start with the command and the message as halfwords', () => {
    const odd = WRITER.replace('PutU16(q, text);', 'PutU8(q, text);')
    expect(() => rules(READER, odd)).toThrow(/PutMsg.*halfwords/)
  })

  it('throws when no single command gets the extra halfword of a sound', () => {
    const none = WRITER.replace('cmd == CMD_SAY_LOUD', 'loud')
    expect(() => rules(READER, none)).toThrow(/PutMsg.*sound/)
    const twice = WRITER.replace(
      '    do {',
      '    if (cmd == CMD_SAY_SET) {\n        PutU16(q, 0);\n    }\n    do {',
    )
    expect(() => rules(READER, twice)).toThrow(/PutMsg.*sound/)
  })

  it('throws when the writer does not put words up to an end marker after the sound', () => {
    const halves = WRITER.replace('PutU32(q, word)', 'PutU16(q, word)')
    expect(() => rules(READER, halves)).toThrow(/PutMsg.*words/)
    const once = WRITER.replace('    do {', '    {').replace(' while (word != WORDS_DONE);', '')
    expect(() => rules(READER, once)).toThrow(/PutMsg.*words/)
  })
})
