// The refusals of the data converter that review W3 and W4 found without a spec: each one names
// what it cannot write, so nothing reaches the module silently.
import { describe, expect, it } from 'vitest'

import { convertElf } from './wasm-data-asm.ts'
import type { SymbolLookup } from './wasm-data-asm.ts'
import { R_ARM_ABS32, R_ARM_ABS8, readElf } from './wasm-elf.ts'
import { elfObject } from './wasm-fixture.ts'
import type { FixtureElf } from './wasm-fixture.ts'

const none: SymbolLookup = { absolute: new Map(), functions: new Map(), data: new Set() }

const convert = (fixture: FixtureElf) =>
  convertElf(readElf(elfObject(fixture), 'data/x.o'), none, 'data/x.o')

const lines = (text: string) => text.split('\n').map((line) => line.trim().replace(/\s+/g, ' '))

const script = (bytes: number[], ...relocs: { offset: number; type?: number }[]) => ({
  sections: [{ name: 'script_data', bytes }],
  symbols: [{ name: 'gFoo', section: 'UND' }],
  relocations: relocs.map(({ offset, type = R_ARM_ABS32 }) => ({
    ...{ section: 'script_data', offset, type, symbol: 'gFoo' },
  })),
})

const byteFor = (value: number, addend: number) => ({
  sections: [{ name: 'script_data', bytes: [addend & 0xff] }],
  symbols: [{ name: 'K', value, section: 'ABS', bind: 'local' as const }],
  relocations: [{ section: 'script_data', offset: 0, type: R_ARM_ABS8, symbol: 'K' }],
})

describe('a relocation at the end of its section', () => {
  it.each([
    ['at the end', 4, /R_ARM_ABS32 at 0x4 runs past the end of the 4 bytes of script_data/],
    ['across the end', 2, /R_ARM_ABS32 at 0x2 runs past the end of the 4 bytes of script_data/],
  ])('is refused %s', (_, offset, message) => {
    expect(() => convert(script([0, 0, 0, 0], { offset }))).toThrow(message)
  })

  it('is written when its last byte is the section last', () => {
    expect(lines(convert(script([1, 1, 0, 0, 0, 0], { offset: 2 })).text)).toEqual(
      expect.arrayContaining(['.byte 1, 1', '.int32 gFoo', '.size irv_section_1, 6']),
    )
  })

  it('is refused in a .bss section, which has no bytes', () => {
    const fixture = { ...script([0, 0, 0, 0], { offset: 0 }) }
    const bss = { ...fixture, sections: [{ name: 'script_data', bytes: [0, 0, 0, 0], type: 8 }] }
    expect(() => convert(bss)).toThrow(/at 0x0 runs past the end of the 0 bytes of script_data/)
  })
})

describe('the data converter refuses', () => {
  it('two relocations that overlap', () => {
    const fixture = script([0, 0, 0, 0, 0, 0, 0, 0], { offset: 0 }, { offset: 2 })
    expect(() => convert(fixture)).toThrow(/two relocations overlap at 0x2 in script_data/)
  })

  it('an R_ARM_ABS8 against a symbol that is no absolute value', () => {
    expect(() => convert(script([0], { offset: 0, type: R_ARM_ABS8 }))).toThrow(
      /R_ARM_ABS8 at 0x0 against gFoo, which is not an absolute value/,
    )
  })

  it('an R_ARM_ABS8 whose value does not fit a byte', () => {
    expect(() => convert(byteFor(255, 1))).toThrow(/K \+ addend is 256, which does not fit 1 bytes/)
  })

  it('an allocated section that is neither PROGBITS nor NOBITS', () => {
    const fixture = { sections: [{ name: '.note', bytes: [0, 0, 0, 0], type: 7, flags: 2 }] }
    expect(() => convert(fixture)).toThrow(/section \.note has type 7 and alignment 1/)
  })

  it('an alignment that is no power of two', () => {
    const fixture = { sections: [{ name: 'script_data', bytes: [0, 0, 0], align: 3 }] }
    expect(() => convert(fixture)).toThrow(/script_data has type 1 and alignment 3/)
  })

  it.each([['a-b'], ['irv_section_1']])('the symbol name %s, which it cannot write', (name) => {
    const fixture = {
      sections: [{ name: 'script_data', bytes: [0] }],
      symbols: [{ name, section: 'script_data' }],
    }
    expect(() => convert(fixture)).toThrow(`the symbol name "${name}" cannot be written`)
  })

  it('a label past the end of its section', () => {
    const fixture = {
      sections: [{ name: 'script_data', bytes: [0, 0, 0, 0] }],
      symbols: [{ name: 'gLate', value: 5, section: 'script_data' }],
    }
    expect(() => convert(fixture)).toThrow(/gLate lies past the end of script_data/)
  })

  it('a relocation against a common symbol', () => {
    const fixture = {
      ...script([0, 0, 0, 0], { offset: 0 }),
      symbols: [{ name: 'gFoo', section: 'COMMON' }],
    }
    expect(() => convert(fixture)).toThrow(/data\/x\.o: common symbol gFoo/)
  })

  it.each([
    ['an index past the symbol table', 99],
    ['the null symbol', 0],
  ])('a relocation with %s', (_, symbol) => {
    const fixture = {
      ...script([0, 0, 0, 0]),
      relocations: [{ section: 'script_data', offset: 0, type: R_ARM_ABS32, symbol }],
    }
    expect(() => convert(fixture)).toThrow(`the relocation at 0x0 in script_data has no symbol`)
  })
})

describe('an R_ARM_ABS8 against an absolute value', () => {
  it.each([
    [7, 1, '.byte 8'],
    [0, -128, '.byte 128'],
  ])('writes %i with the addend %i as one byte', (value, addend, line) => {
    expect(lines(convert(byteFor(value, addend)).text)).toContain(line)
  })
})
