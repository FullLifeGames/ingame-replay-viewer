import { describe, expect, it } from 'vitest'

import {
  bodyOf,
  defineValue,
  enumAround,
  parseFormatTable,
  parseSymbols,
  pickSymbols,
  stripComments,
} from './gen5-bw2-c'

// Every input here is written for the spec; none is copied from pokebw2.

// Scene: the spike looks up the adapter list's address by name and gets the retail address.
describe('parseSymbols', () => {
  const list = [
    'Spin_Main kind:function(thumb,size=0x4a) addr:0x0219a010',
    'Spin_Arm kind:function(arm,size=0x20) addr:0x0219a040',
    'sTable kind:data(any) addr:0x021c0000',
    'sSlots kind:bss addr:0x021c8000',
    'data_ov001_021c8004 kind:bss addr:0x021c8004 ambiguous',
    '.L_0219a020 kind:label(thumb) addr:0x0219a020 local',
    '',
  ].join('\n')

  it("reads name, kind, address, a function's size and a code symbol's instruction set", () => {
    expect(parseSymbols(list, 'ov001')).toEqual([
      {
        name: 'Spin_Main',
        kind: 'function',
        address: 0x0219a010,
        size: 0x4a,
        mode: 'thumb',
        module: 'ov001',
      },
      {
        name: 'Spin_Arm',
        kind: 'function',
        address: 0x0219a040,
        size: 0x20,
        mode: 'arm',
        module: 'ov001',
      },
      { name: 'sTable', kind: 'data', address: 0x021c0000, module: 'ov001' },
      { name: 'sSlots', kind: 'bss', address: 0x021c8000, module: 'ov001' },
      { name: 'data_ov001_021c8004', kind: 'bss', address: 0x021c8004, module: 'ov001' },
      { name: '.L_0219a020', kind: 'label', address: 0x0219a020, mode: 'thumb', module: 'ov001' },
    ])
  })

  it('throws on a line it cannot read, with the line', () => {
    expect(() => parseSymbols('sOdd kind:thing addr:0x02000000', 'arm9')).toThrow(/sOdd/)
  })

  it('picks the named symbols and names a missing or doubled one', () => {
    const symbols = parseSymbols(list, 'ov001')
    expect(pickSymbols(symbols, ['sSlots']).sSlots?.address).toBe(0x021c8000)
    expect(() => pickSymbols(symbols, ['sGone'])).toThrow(/sGone/)
    const doubled = [
      ...symbols,
      { name: 'sSlots', kind: 'bss' as const, address: 0x021c9000, module: 'ov001' },
    ]
    expect(() => pickSymbols(doubled, ['sSlots'])).toThrow(/sSlots.*2/)
  })
})

// Scene: a command's number is its place in the header's enum, comments and all.
describe('enumAround', () => {
  const header = `
    #define LIMIT 12
    // Shapes
    typedef enum {
        SHAPE_NONE,
        SHAPE_ROUND, // a comment with SHAPE_FAKE in it
        /* a block comment */ SHAPE_SQUARE = 0x10,
        SHAPE_STAR,
        SHAPE_MAX,
    } Shape;
    enum { OTHER_A, OTHER_B };
  `

  it('gives each name its value, counting on from an explicit one', () => {
    expect(enumAround(stripComments(header), 'SHAPE_ROUND')).toEqual({
      SHAPE_NONE: 0,
      SHAPE_ROUND: 1,
      SHAPE_SQUARE: 0x10,
      SHAPE_STAR: 0x11,
      SHAPE_MAX: 0x12,
    })
    expect(enumAround(header, 'OTHER_B')).toEqual({ OTHER_A: 0, OTHER_B: 1 })
  })

  it('throws on a value it would have to compute, and on a name in no enum', () => {
    expect(() => enumAround('enum { A = 1 << 2, B };', 'B')).toThrow(/A = 1 << 2/)
    expect(() => enumAround(header, 'SHAPE_FAKE')).toThrow(/SHAPE_FAKE/)
  })

  it('reads a define', () => {
    expect(defineValue(header, 'LIMIT')).toBe(12)
    expect(defineValue('#define END 0x7eed0000', 'END')).toBe(0x7eed0000)
    expect(() => defineValue(header, 'GONE')).toThrow(/GONE/)
  })
})

describe('stripComments and bodyOf', () => {
  it('drops both kinds of comment', () => {
    expect(stripComments('a // b\nc /* d\ne */ f')).toBe('a \nc  f')
  })

  it("gives a function's body, past its prototype", () => {
    const source =
      'static int Twice(int x);\nstatic int Twice(int x) {\n    if (x) { return 2 * x; }\n}\n'
    expect(bodyOf(source, 'Twice(').trim()).toBe('if (x) { return 2 * x; }')
    expect(() => bodyOf(source, 'Thrice(')).toThrow(/Thrice/)
  })
})

// Scene: each command's format comes from the format table, and a gap there stops the run.
describe('parseFormatTable', () => {
  const source = `
    static const u8 sShapeArgs[SHAPE_MAX] = {
        [SHAPE_NONE] = ARGS_NONE,
        [SHAPE_ROUND] = ARGS_U8,
        [SHAPE_SQUARE] = ARGS_U8_U16,
    };
  `

  it('maps each command to its format name and names the bound', () => {
    expect(parseFormatTable(source, 'sShapeArgs')).toEqual({
      bound: 'SHAPE_MAX',
      entries: { SHAPE_NONE: 'ARGS_NONE', SHAPE_ROUND: 'ARGS_U8', SHAPE_SQUARE: 'ARGS_U8_U16' },
    })
  })

  it('throws on an entry it cannot read and on a missing table', () => {
    const odd = source.replace('[SHAPE_ROUND] = ARGS_U8', 'ARGS_U8')
    expect(() => parseFormatTable(odd, 'sShapeArgs')).toThrow(/ARGS_U8/)
    expect(() => parseFormatTable(source, 'sOther')).toThrow(/sOther/)
  })
})
