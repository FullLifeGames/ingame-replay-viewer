// A reader for the ARM ELF relocatable objects that the ROM build assembles from the expansion's
// data (#35): little-endian ELF32, section headers, `.symtab` with its `.strtab`, and the `.rel*`
// sections. The data converter (wasm-data-asm.ts) turns what it reads into wasm assembly.

export const R_ARM_ABS32 = 2
export const R_ARM_ABS16 = 5
export const R_ARM_ABS8 = 8
export const SHN_UNDEF = 0
export const SHN_ABS = 0xfff1
export const SHN_COMMON = 0xfff2
export const STB_LOCAL = 0
export const STB_WEAK = 2
export const STT_SECTION = 3
export const STT_FILE = 4
export const SHT_PROGBITS = 1
export const SHT_NOBITS = 8
export const SHF_WRITE = 0x1
export const SHF_ALLOC = 0x2
export const SHF_EXECINSTR = 0x4

const EM_ARM = 40
const ET_REL = 1
const SHT_SYMTAB = 2
const SHT_RELA = 4
const SHT_REL = 9

export interface ElfSection {
  index: number
  name: string
  type: number
  flags: number
  align: number
  size: number
  link: number
  info: number
  bytes: Uint8Array
}

export interface ElfSymbol {
  index: number
  name: string
  value: number
  type: number
  bind: number
  // The section index, or SHN_UNDEF, SHN_ABS, SHN_COMMON.
  section: number
}

export interface ElfRelocation {
  offset: number
  type: number
  symbol: number
}

export interface ElfObject {
  name: string
  sections: ElfSection[]
  symbols: ElfSymbol[]
  // By the index of the section the relocations apply to.
  relocations: Map<number, ElfRelocation[]>
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

function cString(bytes: Uint8Array, at: number): string {
  const end = bytes.indexOf(0, at)
  return new TextDecoder().decode(bytes.subarray(at, end < 0 ? bytes.length : end))
}

function checkHeader(view: DataView, name: string): void {
  const magic = view.byteLength >= 52 ? view.getUint32(0, false) : 0
  if (magic !== 0x7f454c46) throw new Error(`${name} is not an ELF file`)
  const [elfClass, encoding] = [view.getUint8(4), view.getUint8(5)]
  if (elfClass !== 1 || encoding !== 1) {
    throw new Error(`${name} is not a little-endian ELF32 object (class ${String(elfClass)})`)
  }
  const [type, machine] = [view.getUint16(16, true), view.getUint16(18, true)]
  if (type !== ET_REL || machine !== EM_ARM) {
    throw new Error(
      `${name} is no ARM relocatable object (type ${String(type)}, machine ${String(machine)})`,
    )
  }
}

function readSection(bytes: Uint8Array, view: DataView, index: number, name: string) {
  const at = view.getUint32(32, true) + index * 40
  const word = (field: number) => view.getUint32(at + field * 4, true)
  const [type, offset, size] = [word(1), word(4), word(5)]
  if (type !== SHT_NOBITS && offset + size > bytes.length) {
    throw new Error(`${name}: section ${String(index)} runs past the end of the file`)
  }
  const data = type === SHT_NOBITS ? new Uint8Array(0) : bytes.subarray(offset, offset + size)
  return {
    index,
    nameAt: word(0),
    type,
    flags: word(2),
    size,
    link: word(6),
    info: word(7),
    align: word(8),
    bytes: data,
  }
}

function readSections(bytes: Uint8Array, view: DataView, name: string): ElfSection[] {
  const [count, names] = [view.getUint16(48, true), view.getUint16(50, true)]
  if (view.getUint32(32, true) + count * 40 > bytes.length) {
    throw new Error(`${name}: the section headers run past the end of the file`)
  }
  const raw = Array.from({ length: count }, (_, index) => readSection(bytes, view, index, name))
  const strings = raw[names]?.bytes ?? new Uint8Array(0)
  return raw.map(({ nameAt, ...section }) => ({ ...section, name: cString(strings, nameAt) }))
}

function readSymbols(sections: readonly ElfSection[]): ElfSymbol[] {
  const symtab = sections.find((section) => section.type === SHT_SYMTAB)
  if (symtab === undefined) return []
  const strings = sections[symtab.link]?.bytes ?? new Uint8Array(0)
  const view = viewOf(symtab.bytes)
  return Array.from({ length: Math.floor(symtab.size / 16) }, (_, index) => {
    const at = index * 16
    const info = view.getUint8(at + 12)
    const section = view.getUint16(at + 14, true)
    const type = info & 0xf
    const own = cString(strings, view.getUint32(at, true))
    // A section symbol has no name of its own; it goes by its section's.
    const name = type === STT_SECTION ? (sections[section]?.name ?? '') : own
    return { index, name, value: view.getUint32(at + 4, true), type, bind: info >> 4, section }
  })
}

function readRelocations(
  sections: readonly ElfSection[],
  name: string,
): Map<number, ElfRelocation[]> {
  const relocations = new Map<number, ElfRelocation[]>()
  for (const section of sections) {
    if (section.type === SHT_RELA) {
      throw new Error(`${name}: RELA section ${section.name}, and ARM objects use REL`)
    }
    if (section.type !== SHT_REL) continue
    const view = viewOf(section.bytes)
    const list = Array.from({ length: Math.floor(section.size / 8) }, (_, i) => {
      const info = view.getUint32(i * 8 + 4, true)
      return { offset: view.getUint32(i * 8, true), type: info & 0xff, symbol: info >>> 8 }
    })
    relocations.set(section.info, [...(relocations.get(section.info) ?? []), ...list])
  }
  return relocations
}

export function readElf(bytes: Uint8Array, name: string): ElfObject {
  const view = viewOf(bytes)
  checkHeader(view, name)
  const sections = readSections(bytes, view, name)
  const symbols = readSymbols(sections)
  return { name, sections, symbols, relocations: readRelocations(sections, name) }
}

export interface ElfDefinitions {
  // Global labels in a section of the object.
  data: Set<string>
  // Global absolute symbols with their values: the expansion's constants that `.set` makes.
  absolute: Map<string, number>
}

export function globalDefinitions(elf: ElfObject): ElfDefinitions {
  const data = new Set<string>()
  const absolute = new Map<string, number>()
  for (const symbol of elf.symbols) {
    if (symbol.bind === STB_LOCAL || symbol.section === SHN_UNDEF) continue
    if (symbol.section === SHN_ABS) absolute.set(symbol.name, symbol.value)
    else if (symbol.section !== SHN_COMMON) data.add(symbol.name)
  }
  return { data, absolute }
}
