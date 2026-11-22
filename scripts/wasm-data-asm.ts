// The data converter of the WebAssembly build (#35): an ARM ELF data object of the ROM build
// (battle scripts, animation scripts, songs) as LLVM wasm assembly that `emcc -c` assembles. One
// data segment per ELF section, one label per symbol with its `.size`, `.byte` runs for the bytes,
// and `.int32 sym+addend` for each R_ARM_ABS32. A relocation against an absolute symbol writes its
// value. Anything else the converter cannot write is an error that names it.
import {
  R_ARM_ABS16,
  R_ARM_ABS32,
  R_ARM_ABS8,
  SHF_ALLOC,
  SHF_EXECINSTR,
  SHF_WRITE,
  SHN_ABS,
  SHN_COMMON,
  SHN_UNDEF,
  SHT_NOBITS,
  SHT_PROGBITS,
  STB_LOCAL,
  STB_WEAK,
  STT_FILE,
  STT_SECTION,
  globalDefinitions,
} from './wasm-elf.ts'
import type { ElfObject, ElfRelocation, ElfSection, ElfSymbol } from './wasm-elf.ts'
import { EFFECT_ADDEND, effectList } from './wasm-effects.ts'
import type { WasmLookup } from './wasm-signatures.ts'

export interface SymbolLookup {
  // Global absolute symbols of every data object.
  absolute: ReadonlyMap<string, number>
  // Function name to its `(params) -> (results)`, from the C objects.
  functions: ReadonlyMap<string, string>
  // Data defined by a C object or a data object.
  data: ReadonlySet<string>
}

export interface Converted {
  text: string
  // Function targets, declared with `.functype`.
  functions: string[]
  // Data targets that no C object and no data object defines.
  undefined: string[]
  // Functions marked `+ROM_SIZE` as requesting effects (wasm-effects.ts), each once, by name.
  effects: string[]
}

const RELOCATIONS: Record<number, { name: string; width: 1 | 2 | 4 }> = {
  [R_ARM_ABS32]: { name: 'R_ARM_ABS32', width: 4 },
  [R_ARM_ABS16]: { name: 'R_ARM_ABS16', width: 2 },
  [R_ARM_ABS8]: { name: 'R_ARM_ABS8', width: 1 },
}
const DIRECTIVES = { 1: '.byte', 2: '.int16', 4: '.int32' }
const BYTES_PER_LINE = 16
const NAME = /^[A-Za-z_.][\w.$]*$/
// ARM mapping symbols ($a, $t, $d) mark code and data runs; they carry nothing for wasm.
const MAPPING = /^\$[adt](\.|$)/
// The end of the first line of every data assembly; the tree guard finds a tracked one by it.
export const CONVERTED_BY = 'converted by scripts/wasm-data-asm.ts'

export function symbolLookup(elfs: readonly ElfObject[], wasm: WasmLookup): SymbolLookup {
  const absolute = new Map<string, number>()
  const data = new Set(wasm.data)
  for (const elf of elfs) {
    const defined = globalDefinitions(elf)
    for (const name of defined.data) data.add(name)
    for (const [name, value] of defined.absolute) {
      const known = absolute.get(name)
      if (known !== undefined && known !== value) {
        throw new Error(
          `${elf.name}: ${name} was ${String(known)} before and is ${String(value)} here`,
        )
      }
      absolute.set(name, value)
    }
  }
  return { absolute, functions: wasm.functions, data }
}

interface Context {
  elf: ElfObject
  lookup: SymbolLookup
  source: string
  functions: Set<string>
  undefined: Set<string>
  effects: Set<string>
}

const hex = (value: number) => `0x${value.toString(16)}`
const sectionLabel = (section: ElfSection) => `irv_section_${String(section.index)}`
const plus = (name: string, addend: number) =>
  addend === 0 ? name : `${name}${addend > 0 ? '+' : ''}${String(addend)}`

function dataSections(ctx: Context): ElfSection[] {
  const sections = ctx.elf.sections.filter((s) => s.flags & SHF_ALLOC && s.size > 0)
  for (const section of sections) {
    if (section.flags & SHF_EXECINSTR) {
      throw new Error(`${ctx.source}: section ${section.name} holds code, which wasm cannot take`)
    }
    const kept = section.type === SHT_PROGBITS || section.type === SHT_NOBITS
    if (!kept || Math.log2(Math.max(section.align, 1)) % 1 !== 0) {
      throw new Error(
        `${ctx.source}: section ${section.name} has type ${String(section.type)} and alignment ${String(section.align)}`,
      )
    }
  }
  return sections
}

function labelsOf(ctx: Context, section: ElfSection): ElfSymbol[] {
  const labels = ctx.elf.symbols.filter(
    (s) =>
      s.section === section.index &&
      s.type !== STT_SECTION &&
      s.type !== STT_FILE &&
      !MAPPING.test(s.name),
  )
  for (const label of labels) {
    if (!NAME.test(label.name) || /^irv_section_\d+$/.test(label.name)) {
      throw new Error(`${ctx.source}: the symbol name "${label.name}" cannot be written`)
    }
    if (label.value > section.size) {
      throw new Error(`${ctx.source}: ${label.name} lies past the end of ${section.name}`)
    }
  }
  return labels.sort((a, b) => a.value - b.value || a.index - b.index)
}

function readAddend(section: ElfSection, offset: number, width: 1 | 2 | 4): number {
  const view = new DataView(section.bytes.buffer, section.bytes.byteOffset + offset, width)
  if (width === 4) return view.getInt32(0, true)
  return width === 2 ? view.getInt16(0, true) : view.getInt8(0)
}

function absoluteValue(ctx: Context, symbol: ElfSymbol): number | undefined {
  if (symbol.section === SHN_ABS) return symbol.value
  return symbol.section === SHN_UNDEF ? ctx.lookup.absolute.get(symbol.name) : undefined
}

function fitted(name: string, value: number, width: 1 | 2 | 4): string {
  const span = 2 ** (width * 8)
  if (width < 4 && (value < -span / 2 || value >= span)) {
    throw new Error(
      `${name} + addend is ${String(value)}, which does not fit ${String(width)} bytes`,
    )
  }
  return `\t${DIRECTIVES[width]}\t${String(((value % span) + span) % span)}`
}

function reference(ctx: Context, symbol: ElfSymbol, addend: number): string {
  if (symbol.type === STT_SECTION) {
    const section = ctx.elf.sections[symbol.section]
    if (section !== undefined) return plus(sectionLabel(section), symbol.value + addend)
  }
  if (symbol.section === SHN_COMMON) throw new Error(`${ctx.source}: common symbol ${symbol.name}`)
  if (symbol.section !== SHN_UNDEF) return plus(symbol.name, addend)
  if (ctx.lookup.functions.has(symbol.name)) {
    if (addend === EFFECT_ADDEND) ctx.effects.add(symbol.name)
    else if (addend !== 0) {
      throw new Error(`${ctx.source}: function ${plus(symbol.name, addend)} has an addend`)
    }
    ctx.functions.add(symbol.name)
    return symbol.name
  }
  if (!ctx.lookup.data.has(symbol.name)) ctx.undefined.add(symbol.name)
  return plus(symbol.name, addend)
}

function field(ctx: Context, section: ElfSection, reloc: ElfRelocation): string {
  const kind = RELOCATIONS[reloc.type]
  if (kind === undefined) {
    throw new Error(
      `${ctx.source}: relocation type ${String(reloc.type)} at offset ${hex(reloc.offset)} in ${section.name}; the converter knows R_ARM_ABS32, R_ARM_ABS16 and R_ARM_ABS8`,
    )
  }
  const at = `at ${hex(reloc.offset)}`
  // A field past the end would read the next section's bytes as its addend (review W3).
  if (reloc.offset + kind.width > section.bytes.length) {
    throw new Error(
      `${ctx.source}: ${kind.name} ${at} runs past the end of the ${String(section.bytes.length)} bytes of ${section.name}`,
    )
  }
  // Index 0 is the null symbol, which names nothing.
  const symbol = reloc.symbol === 0 ? undefined : ctx.elf.symbols[reloc.symbol]
  if (symbol === undefined) {
    throw new Error(`${ctx.source}: the relocation ${at} in ${section.name} has no symbol`)
  }
  const addend = readAddend(section, reloc.offset, kind.width)
  const value = absoluteValue(ctx, symbol)
  if (value !== undefined) return fitted(symbol.name, value + addend, kind.width)
  if (kind.width !== 4) {
    throw new Error(
      `${ctx.source}: ${kind.name} at ${hex(reloc.offset)} against ${symbol.name}, which is not an absolute value`,
    )
  }
  return `\t.int32\t${reference(ctx, symbol, addend)}`
}

class SectionWriter {
  readonly lines: string[] = []
  private cursor = 0
  private next = 0
  private readonly section: ElfSection
  private readonly labels: readonly ElfSymbol[]
  private readonly bss: boolean
  constructor(section: ElfSection, labels: readonly ElfSymbol[]) {
    this.bss = section.type === SHT_NOBITS
    this.section = section
    this.labels = labels
  }

  private emitLabels(): void {
    for (let label = this.labels[this.next]; label?.value === this.cursor;) {
      if (label.bind !== STB_LOCAL) {
        this.lines.push(`\t${label.bind === STB_WEAK ? '.weak' : '.globl'}\t${label.name}`)
      }
      this.lines.push(`${label.name}:`)
      label = this.labels[++this.next]
    }
  }

  bytesUpTo(target: number): void {
    this.emitLabels()
    while (this.cursor < target) {
      const label = this.labels[this.next]?.value ?? Infinity
      const end = Math.min(target, label, this.cursor + (this.bss ? Infinity : BYTES_PER_LINE))
      const run = [...this.section.bytes.subarray(this.cursor, end)]
      // A .bss section has no bytes in the file, only its size.
      this.lines.push(
        this.bss ? `\t.skip\t${String(end - this.cursor)}` : `\t.byte\t${run.join(', ')}`,
      )
      this.cursor = end
      this.emitLabels()
    }
  }

  field(line: string, reloc: ElfRelocation, width: number, source: string): void {
    if (reloc.offset !== this.cursor) {
      throw new Error(
        `${source}: two relocations overlap at ${hex(reloc.offset)} in ${this.section.name}`,
      )
    }
    const inside = this.labels[this.next]
    if (inside !== undefined && inside.value < this.cursor + width) {
      throw new Error(
        `${source}: ${inside.name} lies inside the relocation at ${hex(this.cursor)} in ${this.section.name}`,
      )
    }
    this.lines.push(line)
    this.cursor += width
  }
}

function sizes(labels: readonly ElfSymbol[], section: ElfSection): string[] {
  const offsets = [...new Set(labels.map((label) => label.value)), section.size]
  return labels.map((label) => {
    const end = offsets.find((offset) => offset > label.value) ?? section.size
    return `\t.size\t${label.name}, ${String(end - label.value)}`
  })
}

function emitSection(ctx: Context, section: ElfSection): string[] {
  const labels = labelsOf(ctx, section)
  const writer = new SectionWriter(section, labels)
  const relocs = [...(ctx.elf.relocations.get(section.index) ?? [])].sort(
    (a, b) => a.offset - b.offset,
  )
  for (const reloc of relocs) {
    const line = field(ctx, section, reloc)
    writer.bytesUpTo(reloc.offset)
    writer.field(line, reloc, RELOCATIONS[reloc.type]?.width ?? 4, ctx.source)
  }
  writer.bytesUpTo(section.size)
  const writable = section.flags & SHF_WRITE ? '.data' : '.rodata'
  const prefix = section.type === SHT_NOBITS ? '.bss' : writable
  const segment = `${prefix}.${section.name.replace(/^\./, '').replace(/[^\w.]/g, '_')}`
  return [
    `\t.section\t${segment},"",@`,
    `\t.p2align\t${String(Math.log2(Math.max(section.align, 1)))}`,
    `${sectionLabel(section)}:`,
    ...writer.lines,
    `\t.size\t${sectionLabel(section)}, ${String(section.size)}`,
    ...sizes(labels, section),
  ]
}

export function convertElf(elf: ElfObject, lookup: SymbolLookup, source: string): Converted {
  const ctx: Context = {
    ...{ elf, lookup, source },
    ...{ functions: new Set(), undefined: new Set(), effects: new Set() },
  }
  const body = dataSections(ctx).flatMap((section) => emitSection(ctx, section))
  const effects = [...ctx.effects].sort()
  const functions = [...ctx.functions].sort()
  const declarations = functions.map(
    (name) => `\t.functype\t${name} ${lookup.functions.get(name) ?? ''}`,
  )
  const heading = `# ${source}, ${CONVERTED_BY}`
  const text = [heading, ...declarations, ...body, ...effectList(effects), '']
  return { text: text.join('\n'), functions, undefined: [...ctx.undefined].sort(), effects }
}
