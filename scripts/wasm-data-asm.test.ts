import { describe, expect, it } from 'vitest'

import { convertElf, symbolLookup } from './wasm-data-asm.ts'
import type { SymbolLookup } from './wasm-data-asm.ts'
import { R_ARM_ABS16, R_ARM_ABS32, readElf } from './wasm-elf.ts'
import { elfObject } from './wasm-fixture.ts'
import type { FixtureElf } from './wasm-fixture.ts'
import { mergeWasmSymbols, readWasmSymbols } from './wasm-signatures.ts'
import { wasmObject } from './wasm-fixture.ts'

const none: SymbolLookup = { absolute: new Map(), functions: new Map(), data: new Set() }

const convert = (fixture: FixtureElf, lookup: SymbolLookup = none) =>
  convertElf(readElf(elfObject(fixture), 'data/x.o'), lookup, 'data/x.o')

const lines = (text: string) => text.split('\n').map((line) => line.trim().replace(/\s+/g, ' '))

const bytes = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

describe('the data converter', () => {
  it('gives two global symbols two labels, each with its .size', () => {
    const { text } = convert({
      sections: [{ name: 'script_data', bytes: bytes(12) }],
      symbols: [
        { name: 'gFirst', value: 0, section: 'script_data' },
        { name: 'gSecond', value: 8, section: 'script_data' },
      ],
    })
    const out = lines(text)
    expect(out).toEqual(expect.arrayContaining(['.globl gFirst', 'gFirst:', 'gSecond:']))
    expect(out).toEqual(expect.arrayContaining(['.size gFirst, 8', '.size gSecond, 4']))
    expect(out.indexOf('gSecond:')).toBeGreaterThan(out.indexOf('.byte 1, 2, 3, 4, 5, 6, 7, 8'))
  })

  it('writes an R_ARM_ABS32 with the addend from the bytes as .int32 sym+addend', () => {
    const { text } = convert({
      sections: [{ name: 'script_data', bytes: [9, 9, 9, 9, 12, 0, 0, 0, 7] }],
      symbols: [{ name: 'gFoo', section: 'UND' }],
      relocations: [{ section: 'script_data', offset: 4, type: R_ARM_ABS32, symbol: 'gFoo' }],
    })
    expect(lines(text)).toEqual(
      expect.arrayContaining(['.byte 9, 9, 9, 9', '.int32 gFoo+12', '.byte 7']),
    )
  })

  it('points a relocation against a local section symbol at the section label plus the offset', () => {
    const { text } = convert({
      sections: [{ name: 'script_data', bytes: [0, 0, 0, 0, 0x10, 0x01, 0, 0] }],
      symbols: [{ name: 'script_data', section: 'script_data', bind: 'local', type: 'section' }],
      relocations: [
        { section: 'script_data', offset: 4, type: R_ARM_ABS32, symbol: 'script_data' },
      ],
    })
    const out = lines(text)
    expect(out).toContain('irv_section_1:')
    expect(out).toContain('.int32 irv_section_1+272')
    expect(out).not.toContain('.globl irv_section_1')
  })

  it('writes the value of an absolute symbol for an R_ARM_ABS16', () => {
    const lookup = { ...none, absolute: new Map([['B_MSG_MON_ANGRY', 3]]) }
    const { text } = convert(
      {
        sections: [{ name: 'script_data', bytes: [5, 2, 0, 6] }],
        symbols: [{ name: 'B_MSG_MON_ANGRY', section: 'UND' }],
        relocations: [
          { section: 'script_data', offset: 1, type: R_ARM_ABS16, symbol: 'B_MSG_MON_ANGRY' },
        ],
      },
      lookup,
    )
    expect(lines(text)).toEqual(expect.arrayContaining(['.byte 5', '.int16 5', '.byte 6']))
  })

  it('refuses a relocation type it does not know and names it', () => {
    const fixture = {
      sections: [{ name: 'script_data', bytes: [0, 0, 0, 0] }],
      symbols: [{ name: 'gFoo', section: 'UND' }],
      relocations: [{ section: 'script_data', offset: 0, type: 10, symbol: 'gFoo' }],
    }
    expect(() => convert(fixture)).toThrow(/data\/x\.o.*relocation type 10.*offset 0x0/)
  })

  it('declares a function target with its .functype and lists a target found nowhere', () => {
    const c = wasmObject({ types: [[['i32'], []]], functions: [{ name: 'BS_Foo', type: 0 }] })
    const lookup = symbolLookup([], mergeWasmSymbols([readWasmSymbols(c, 'src/a.o')]))
    const {
      text,
      functions,
      undefined: missing,
    } = convert(
      {
        sections: [{ name: 'script_data', bytes: new Array<number>(8).fill(0) }],
        symbols: [
          { name: 'BS_Foo', section: 'UND' },
          { name: 'gMissing', section: 'UND' },
        ],
        relocations: [
          { section: 'script_data', offset: 0, type: R_ARM_ABS32, symbol: 'BS_Foo' },
          { section: 'script_data', offset: 4, type: R_ARM_ABS32, symbol: 'gMissing' },
        ],
      },
      lookup,
    )
    expect(lines(text)).toEqual(
      expect.arrayContaining(['.functype BS_Foo (i32) -> ()', '.int32 BS_Foo']),
    )
    expect(functions).toEqual(['BS_Foo'])
    expect(missing).toEqual(['gMissing'])
  })

  it('turns the section alignment into .p2align', () => {
    const { text } = convert({
      sections: [{ name: '.rodata', bytes: bytes(4), align: 4, flags: 2 }],
    })
    const out = lines(text)
    expect(out).toContain('.section .rodata.rodata,"",@')
    expect(out[out.indexOf('.section .rodata.rodata,"",@') + 1]).toBe('.p2align 2')
  })
})

describe('the data converter refuses what it cannot write', () => {
  it('refuses an R_ARM_ABS16 against a symbol that is no absolute value', () => {
    const fixture = {
      sections: [{ name: 'script_data', bytes: [0, 0] }],
      symbols: [{ name: 'gFoo', section: 'UND' }],
      relocations: [{ section: 'script_data', offset: 0, type: R_ARM_ABS16, symbol: 'gFoo' }],
    }
    expect(() => convert(fixture)).toThrow(/R_ARM_ABS16.*gFoo.*not an absolute/)
  })

  it('refuses an absolute value that does not fit its field', () => {
    const fixture = {
      sections: [{ name: 'script_data', bytes: [0, 0] }],
      symbols: [{ name: 'BIG', value: 0x10000, section: 'ABS', bind: 'local' as const }],
      relocations: [{ section: 'script_data', offset: 0, type: R_ARM_ABS16, symbol: 'BIG' }],
    }
    expect(() => convert(fixture)).toThrow(/BIG.*65536.*2 bytes/)
  })

  it('refuses a function target with an addend', () => {
    const lookup = { ...none, functions: new Map([['BS_Foo', '() -> ()']]) }
    const fixture = {
      sections: [{ name: 'script_data', bytes: [1, 0, 0, 0] }],
      symbols: [{ name: 'BS_Foo', section: 'UND' }],
      relocations: [{ section: 'script_data', offset: 0, type: R_ARM_ABS32, symbol: 'BS_Foo' }],
    }
    expect(() => convert(fixture, lookup)).toThrow(/BS_Foo\+1/)
  })

  it('refuses code in a data object', () => {
    const fixture = { sections: [{ name: '.text', bytes: [0, 0x47], flags: 6 }] }
    expect(() => convert(fixture)).toThrow(/data\/x\.o.*\.text.*code/)
  })

  it('refuses a label inside a relocated field', () => {
    const fixture = {
      sections: [{ name: 'script_data', bytes: [0, 0, 0, 0] }],
      symbols: [
        { name: 'gFoo', section: 'UND' },
        { name: 'Inside', value: 2, section: 'script_data', bind: 'local' as const },
      ],
      relocations: [{ section: 'script_data', offset: 0, type: R_ARM_ABS32, symbol: 'gFoo' }],
    }
    expect(() => convert(fixture)).toThrow(/Inside.*inside the relocation at 0x0/)
  })

  it('writes a weak symbol as .weak', () => {
    const { text } = convert({
      sections: [{ name: 'script_data', bytes: [1] }],
      symbols: [{ name: 'gWeak', section: 'script_data', bind: 'weak' }],
    })
    expect(lines(text)).toContain('.weak gWeak')
  })
})

describe('the symbol lookup over the data objects', () => {
  const object = (value: number) =>
    readElf(
      elfObject({ sections: [], symbols: [{ name: 'B_MSG_X', value, section: 'ABS' }] }),
      'd.o',
    )

  it('takes the absolute values of every data object', () => {
    const lookup = symbolLookup([object(4), object(4)], { functions: new Map(), data: new Set() })
    expect(lookup.absolute.get('B_MSG_X')).toBe(4)
  })

  it('refuses one name with two values', () => {
    const wasm = { functions: new Map(), data: new Set<string>() }
    expect(() => symbolLookup([object(4), object(5)], wasm)).toThrow(/B_MSG_X.*4.*5/)
  })
})
