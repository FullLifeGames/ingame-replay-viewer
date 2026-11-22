// Writers for the data converter's specs (#35): a small ARM ELF relocatable object and a small
// wasm object file, built in memory, so no binary fixture lands in the tree. Only the fields the
// readers look at are written.

interface FixtureSection {
  name: string
  bytes: readonly number[]
  align?: number
  // SHF_WRITE | SHF_ALLOC by default, as GAS gives a data section.
  flags?: number
  type?: number
}

interface FixtureSymbol {
  name: string
  value?: number
  // A section name, 'ABS', 'COMMON' or 'UND'.
  section: string
  bind?: 'local' | 'global' | 'weak'
  type?: 'notype' | 'section'
}

interface FixtureRelocation {
  section: string
  offset: number
  type: number
  // A symbol's name, or a raw index into the symbol table.
  symbol: string | number
}

export interface FixtureElf {
  sections: readonly FixtureSection[]
  symbols?: readonly FixtureSymbol[]
  relocations?: readonly FixtureRelocation[]
  machine?: number
}

class Bytes {
  readonly out: number[] = []
  u8(value: number): this {
    this.out.push(value & 0xff)
    return this
  }
  u16(value: number): this {
    return this.u8(value).u8(value >>> 8)
  }
  u32(value: number): this {
    return this.u16(value & 0xffff).u16(value >>> 16)
  }
  uleb(value: number): this {
    let rest = value
    do {
      const low = rest & 0x7f
      rest = Math.floor(rest / 128)
      this.u8(rest > 0 ? low | 0x80 : low)
    } while (rest > 0)
    return this
  }
  name(text: string): this {
    this.uleb(text.length)
    for (const char of text) this.u8(char.charCodeAt(0))
    return this
  }
  raw(bytes: readonly number[]): this {
    this.out.push(...bytes)
    return this
  }
}

class StringTable {
  readonly bytes: number[] = [0]
  add(text: string): number {
    if (text === '') return 0
    const at = this.bytes.length
    for (const char of text) this.bytes.push(char.charCodeAt(0))
    this.bytes.push(0)
    return at
  }
}

interface Header {
  name: number
  type: number
  flags: number
  bytes: readonly number[]
  link?: number
  info?: number
  align?: number
  entsize?: number
}

const BINDS = { local: 0, global: 1, weak: 2 }
const SHN_ABS = 0xfff1
const SHN_COMMON = 0xfff2

function symbolTable(
  fixture: FixtureElf,
  sectionIndex: (name: string) => number,
  strtab: StringTable,
) {
  const symbols = [...(fixture.symbols ?? [])].sort(
    (a, b) => (a.bind === 'local' ? 0 : 1) - (b.bind === 'local' ? 0 : 1),
  )
  const table = new Bytes().u32(0).u32(0).u32(0).u32(0)
  for (const symbol of symbols) {
    const shndx =
      { ABS: SHN_ABS, COMMON: SHN_COMMON, UND: 0 }[symbol.section] ?? sectionIndex(symbol.section)
    const type = symbol.type === 'section' ? 3 : 0
    table
      .u32(type === 3 ? 0 : strtab.add(symbol.name))
      .u32(symbol.value ?? 0)
      .u32(0)
    table
      .u8((BINDS[symbol.bind ?? 'global'] << 4) | type)
      .u8(0)
      .u16(shndx)
  }
  const firstGlobal = 1 + symbols.filter((symbol) => symbol.bind === 'local').length
  const index = (name: string | number) =>
    typeof name === 'number' ? name : 1 + symbols.findIndex((symbol) => symbol.name === name)
  return { bytes: table.out, firstGlobal, index }
}

export function elfObject(fixture: FixtureElf): Uint8Array {
  const shstrtab = new StringTable()
  const strtab = new StringTable()
  const headers: Header[] = fixture.sections.map((section) => ({
    name: shstrtab.add(section.name),
    type: section.type ?? 1,
    flags: section.flags ?? 3,
    bytes: section.bytes,
    align: section.align ?? 1,
  }))
  const sectionIndex = (name: string) =>
    1 + fixture.sections.findIndex((section) => section.name === name)
  const symbols = symbolTable(fixture, sectionIndex, strtab)
  const symtabIndex = 1 + headers.length + fixture.sections.length
  for (const section of fixture.sections) {
    const rel = new Bytes()
    for (const reloc of fixture.relocations ?? []) {
      if (reloc.section !== section.name) continue
      rel.u32(reloc.offset).u32((symbols.index(reloc.symbol) << 8) | reloc.type)
    }
    const info = sectionIndex(section.name)
    headers.push({
      name: shstrtab.add(`.rel${section.name}`),
      type: 9,
      flags: 0x40,
      bytes: rel.out,
      link: symtabIndex,
      info,
      align: 4,
      entsize: 8,
    })
  }
  headers.push({
    name: shstrtab.add('.symtab'),
    type: 2,
    flags: 0,
    bytes: symbols.bytes,
    link: symtabIndex + 1,
    info: symbols.firstGlobal,
    align: 4,
    entsize: 16,
  })
  headers.push({ name: shstrtab.add('.strtab'), type: 3, flags: 0, bytes: strtab.bytes })
  headers.push({ name: shstrtab.add('.shstrtab'), type: 3, flags: 0, bytes: shstrtab.bytes })
  return writeElf(headers, fixture.machine ?? 40)
}

function writeElf(headers: readonly Header[], machine: number): Uint8Array {
  const body = new Bytes()
  const offsets = headers.map((header) => {
    while (body.out.length % 4 !== 0) body.u8(0)
    const at = 52 + body.out.length
    body.raw(header.bytes)
    return at
  })
  while (body.out.length % 4 !== 0) body.u8(0)
  const shoff = 52 + body.out.length
  const out = new Bytes().raw([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  out.u16(1).u16(machine).u32(1).u32(0).u32(0).u32(shoff).u32(0x05000000)
  out
    .u16(52)
    .u16(0)
    .u16(0)
    .u16(40)
    .u16(headers.length + 1)
    .u16(headers.length)
  out.raw(body.out)
  out.raw(new Array<number>(40).fill(0))
  headers.forEach((header, i) => {
    out
      .u32(header.name)
      .u32(header.type)
      .u32(header.flags)
      .u32(0)
      .u32(offsets[i] ?? 0)
    out
      .u32(header.bytes.length)
      .u32(header.link ?? 0)
      .u32(header.info ?? 0)
    out.u32(header.align ?? 1).u32(header.entsize ?? 0)
  })
  return new Uint8Array(out.out)
}

export interface FixtureWasm {
  types: readonly (readonly [readonly string[], readonly string[]])[]
  imports?: readonly { name: string; type: number }[]
  functions?: readonly { name: string; type: number; local?: boolean }[]
  data?: readonly string[]
  undefinedData?: readonly string[]
}

const VALTYPES: Record<string, number> = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c }

function section(out: Bytes, id: number, payload: Bytes): void {
  out.u8(id).uleb(payload.out.length).raw(payload.out)
}

function linking(fixture: FixtureWasm): Bytes {
  const imports = fixture.imports ?? []
  const table = new Bytes()
  // A section symbol, as emcc writes one for each custom section.
  const entries: Bytes[] = [new Bytes().u8(3).uleb(2).uleb(0)]
  imports.forEach((_, i) => entries.push(new Bytes().u8(0).uleb(0x10).uleb(i)))
  fixture.functions?.forEach((fn, i) => {
    entries.push(
      new Bytes()
        .u8(0)
        .uleb(fn.local ? 2 : 0)
        .uleb(imports.length + i)
        .name(fn.name),
    )
  })
  fixture.data?.forEach((name) =>
    entries.push(new Bytes().u8(1).uleb(0).name(name).uleb(0).uleb(0).uleb(4)),
  )
  fixture.undefinedData?.forEach((name) => entries.push(new Bytes().u8(1).uleb(0x10).name(name)))
  table.uleb(entries.length)
  for (const entry of entries) table.raw(entry.out)
  return new Bytes().name('linking').uleb(2).u8(8).uleb(table.out.length).raw(table.out)
}

function typeSection(fixture: FixtureWasm): Bytes {
  const types = new Bytes().uleb(fixture.types.length)
  for (const [params, results] of fixture.types) {
    types.u8(0x60).uleb(params.length)
    for (const param of params) types.u8(VALTYPES[param] ?? 0)
    types.uleb(results.length)
    for (const result of results) types.u8(VALTYPES[result] ?? 0)
  }
  return types
}

export function wasmObject(fixture: FixtureWasm): Uint8Array {
  const out = new Bytes().raw([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])
  section(out, 1, typeSection(fixture))
  const imported = fixture.imports ?? []
  const imports = new Bytes().uleb(imported.length + 1)
  imports.name('env').name('__linear_memory').u8(2).u8(0).uleb(1)
  for (const fn of imported) imports.name('env').name(fn.name).u8(0).uleb(fn.type)
  section(out, 2, imports)
  const defined = fixture.functions ?? []
  const functions = new Bytes().uleb(defined.length)
  for (const fn of defined) functions.uleb(fn.type)
  section(out, 3, functions)
  section(out, 0, linking(fixture))
  return new Uint8Array(out.out)
}
