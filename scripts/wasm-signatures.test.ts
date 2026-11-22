import { describe, expect, it } from 'vitest'

import { wasmObject } from './wasm-fixture.ts'
import { mergeWasmSymbols, readWasmSymbols } from './wasm-signatures.ts'

const object = wasmObject({
  types: [
    [['i32'], []],
    [['i32', 'i64'], ['i32']],
    [[], []],
  ],
  imports: [{ name: 'BS_Imported', type: 2 }],
  functions: [
    { name: 'BS_Defined', type: 1 },
    { name: 'StaticHelper', type: 0, local: true },
  ],
  data: ['gBattleMons'],
  undefinedData: ['gElsewhere'],
})

describe('the wasm object reader', () => {
  it('gives a defined function its type from the function section', () => {
    expect(readWasmSymbols(object, 'a.o').functions.get('BS_Defined')).toBe('(i32, i64) -> (i32)')
  })

  it('gives an imported function the type of its import', () => {
    expect(readWasmSymbols(object, 'a.o').imports.get('BS_Imported')).toBe('() -> ()')
  })

  it('leaves out local functions, which no other object can name', () => {
    expect(readWasmSymbols(object, 'a.o').functions.has('StaticHelper')).toBe(false)
  })

  it('lists defined data and leaves out undefined data', () => {
    expect([...readWasmSymbols(object, 'a.o').data]).toEqual(['gBattleMons'])
  })

  it('refuses a file that is no wasm object and names it', () => {
    expect(() => readWasmSymbols(new Uint8Array(8), 'b.o')).toThrow(/b\.o.*not a wasm/)
  })

  it('refuses a wasm file without a linking section', () => {
    const bare = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])
    expect(() => readWasmSymbols(bare, 'c.o')).toThrow(/c\.o.*linking/)
  })
})

describe('the merged signatures', () => {
  const caller = wasmObject({ types: [[['f32'], []]], imports: [{ name: 'BS_Defined', type: 0 }] })
  const other = wasmObject({ types: [[['f64'], []]], imports: [{ name: 'OnlyCalled', type: 0 }] })

  it('takes the definition over a caller import', () => {
    const merged = mergeWasmSymbols([
      readWasmSymbols(caller, 'x.o'),
      readWasmSymbols(object, 'a.o'),
    ])
    expect(merged.functions.get('BS_Defined')).toBe('(i32, i64) -> (i32)')
  })

  it('falls back to an import for a function no object defines', () => {
    const merged = mergeWasmSymbols([readWasmSymbols(other, 'y.o')])
    expect(merged.functions.get('OnlyCalled')).toBe('(f64) -> ()')
  })

  // Two definitions of one name with other types: the converter cannot tell which one the link
  // keeps (review U1).
  it('refuses two definitions of one name with different types and names both objects', () => {
    const clash = wasmObject({ types: [[[], []]], functions: [{ name: 'BS_Defined', type: 0 }] })
    expect(() =>
      mergeWasmSymbols([readWasmSymbols(object, 'a.o'), readWasmSymbols(clash, 'b.o')]),
    ).toThrow('BS_Defined is (i32, i64) -> (i32) in a.o and () -> () in b.o')
  })

  it('takes two definitions of one name with one type', () => {
    const merged = mergeWasmSymbols([
      readWasmSymbols(object, 'a.o'),
      readWasmSymbols(object, 'b.o'),
    ])
    expect(merged.functions.get('BS_Defined')).toBe('(i32, i64) -> (i32)')
  })

  it('collects the data of every object', () => {
    expect(mergeWasmSymbols([readWasmSymbols(object, 'a.o')]).data.has('gBattleMons')).toBe(true)
  })
})
