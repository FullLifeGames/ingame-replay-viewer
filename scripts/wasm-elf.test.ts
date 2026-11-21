import { describe, expect, it } from 'vitest'

import { R_ARM_ABS32, SHN_ABS, SHN_UNDEF, globalDefinitions, readElf } from './wasm-elf.ts'
import { elfObject } from './wasm-fixture.ts'

const fixture = elfObject({
  sections: [{ name: 'script_data', bytes: [1, 2, 3, 4, 0, 0, 0, 0], align: 4 }],
  symbols: [
    { name: 'gFirst', value: 0, section: 'script_data' },
    { name: 'Local', value: 4, section: 'script_data', bind: 'local' },
    { name: 'B_MSG_X', value: 7, section: 'ABS' },
    { name: 'gOther', section: 'UND' },
  ],
  relocations: [{ section: 'script_data', offset: 4, type: R_ARM_ABS32, symbol: 'gOther' }],
})

describe('the ELF reader', () => {
  it('reads a section with its bytes and alignment', () => {
    const section = readElf(fixture, 'a.o').sections.find((s) => s.name === 'script_data')
    expect(section).toMatchObject({ index: 1, align: 4, size: 8 })
    expect([...(section?.bytes ?? [])]).toEqual([1, 2, 3, 4, 0, 0, 0, 0])
  })

  it('reads the symbols with their section, binding and value', () => {
    const symbols = readElf(fixture, 'a.o').symbols
    expect(symbols.find((s) => s.name === 'Local')).toMatchObject({ value: 4, section: 1, bind: 0 })
    expect(symbols.find((s) => s.name === 'B_MSG_X')).toMatchObject({ value: 7, section: SHN_ABS })
    expect(symbols.find((s) => s.name === 'gOther')).toMatchObject({ section: SHN_UNDEF, bind: 1 })
  })

  it('reads the relocations of a section by its index', () => {
    const elf = readElf(fixture, 'a.o')
    const [reloc] = elf.relocations.get(1) ?? []
    expect(reloc?.offset).toBe(4)
    expect(reloc?.type).toBe(R_ARM_ABS32)
    expect(elf.symbols[reloc?.symbol ?? 0]?.name).toBe('gOther')
  })

  it('lists the global definitions: section labels and absolute values', () => {
    const defined = globalDefinitions(readElf(fixture, 'a.o'))
    expect([...defined.data]).toEqual(['gFirst'])
    expect([...defined.absolute]).toEqual([['B_MSG_X', 7]])
  })

  it('refuses an object of another machine and names the file', () => {
    const x86 = elfObject({ sections: [], machine: 3 })
    expect(() => readElf(x86, 'x.o')).toThrow(/x\.o.*machine 3/)
  })

  it('refuses a file that is no ELF', () => {
    expect(() => readElf(new Uint8Array(64), 'zero.o')).toThrow(/zero\.o.*not an ELF/)
  })

  it('refuses a RELA section, which the ARM data objects never carry', () => {
    const rela = elfObject({ sections: [{ name: '.rela.x', bytes: [], type: 4, flags: 0 }] })
    expect(() => readElf(rela, 'r.o')).toThrow(/r\.o.*RELA.*\.rela\.x/)
  })

  it('refuses a section that runs past the end of the file', () => {
    const bytes = elfObject({ sections: [{ name: 'd', bytes: [1, 2, 3, 4] }] })
    expect(() => readElf(bytes.subarray(0, bytes.length - 41), 't.o')).toThrow(/t\.o/)
  })
})
