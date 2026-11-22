// Function signatures and data names from the wasm objects that emcc compiles from the expansion's
// C files (#35). A script table in the ARM data holds function addresses; in wasm each becomes a
// table index, and the assembler needs the function's `.functype` for it. This reader takes the
// type, import and function sections and the linking section's symbol table.

export interface WasmSymbols {
  // The object's name, for errors.
  name: string
  // Defined, non-local functions: name to `(params) -> (results)`.
  functions: Map<string, string>
  // Imported functions with the type their callers declared.
  imports: Map<string, string>
  // Defined, non-local data symbols.
  data: Set<string>
}

const VALTYPES: Record<number, string> = {
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x7b: 'v128',
  0x70: 'funcref',
  0x6f: 'externref',
}

const SYMTAB = 8
const KIND_FUNCTION = 0
const KIND_DATA = 1
const KIND_SECTION = 3
const FLAG_LOCAL = 0x2
const FLAG_UNDEFINED = 0x10
const FLAG_EXPLICIT_NAME = 0x40

class Reader {
  at = 0
  readonly bytes: Uint8Array
  readonly name: string
  constructor(bytes: Uint8Array, name: string) {
    this.bytes = bytes
    this.name = name
  }
  u8(): number {
    const value = this.bytes[this.at++]
    if (value === undefined) throw new Error(`${this.name}: the wasm object ends early`)
    return value
  }
  uleb(): number {
    let [value, scale] = [0, 1]
    for (;;) {
      const byte = this.u8()
      value += (byte & 0x7f) * scale
      if (byte < 0x80) return value
      scale *= 128
    }
  }
  text(): string {
    const length = this.uleb()
    this.at += length
    return new TextDecoder().decode(this.bytes.subarray(this.at - length, this.at))
  }
  limits(): void {
    const flags = this.u8()
    this.uleb()
    if (flags & 1) this.uleb()
  }
}

interface Sections {
  types: string[]
  // Type index per function index, imports first.
  functionTypes: number[]
  // Field name per imported function index.
  importNames: string[]
  linking?: Reader
}

function readTypes(reader: Reader): string[] {
  return Array.from({ length: reader.uleb() }, () => {
    reader.u8()
    const vector = () => Array.from({ length: reader.uleb() }, () => VALTYPES[reader.u8()] ?? '?')
    const params = vector()
    return `(${params.join(', ')}) -> (${vector().join(', ')})`
  })
}

function readImports(reader: Reader, sections: Sections): void {
  const count = reader.uleb()
  for (let i = 0; i < count; i++) {
    reader.text()
    const field = reader.text()
    const kind = reader.u8()
    if (kind === 0) {
      sections.functionTypes.push(reader.uleb())
      sections.importNames.push(field)
    } else if (kind === 1) {
      reader.u8()
      reader.limits()
    } else if (kind === 2) reader.limits()
    else if (kind === 3) reader.at += 2
    else {
      reader.u8()
      reader.uleb()
    }
  }
}

function readSections(bytes: Uint8Array, name: string): Sections {
  const head = [...bytes.subarray(0, 8)].join(',')
  if (head !== '0,97,115,109,1,0,0,0') throw new Error(`${name} is not a wasm object`)
  const reader = new Reader(bytes, name)
  reader.at = 8
  const sections: Sections = { types: [], functionTypes: [], importNames: [] }
  while (reader.at < bytes.length) {
    const id = reader.u8()
    const end = reader.uleb() + reader.at
    const body = new Reader(bytes.subarray(0, end), name)
    body.at = reader.at
    if (id === 1) sections.types = readTypes(body)
    else if (id === 2) readImports(body, sections)
    else if (id === 3) {
      const count = body.uleb()
      for (let i = 0; i < count; i++) sections.functionTypes.push(body.uleb())
    } else if (id === 0 && body.text() === 'linking') sections.linking = body
    reader.at = end
  }
  return sections
}

function readData(reader: Reader, flags: number, out: WasmSymbols): void {
  const name = reader.text()
  if (flags & FLAG_UNDEFINED) return
  // Segment, offset and size.
  for (let i = 0; i < 3; i++) reader.uleb()
  if (!(flags & FLAG_LOCAL)) out.data.add(name)
}

function readSymbol(reader: Reader, sections: Sections, out: WasmSymbols): void {
  const kind = reader.u8()
  const flags = reader.uleb()
  if (kind === KIND_DATA) {
    readData(reader, flags, out)
    return
  }
  const index = reader.uleb()
  // A section symbol is its index alone.
  if (kind === KIND_SECTION) return
  const undefined_ = (flags & FLAG_UNDEFINED) !== 0
  const name = symbolName(reader, flags, sections.importNames[index])
  if (kind !== KIND_FUNCTION || name === undefined || flags & FLAG_LOCAL) return
  const type = sections.types[sections.functionTypes[index] ?? -1] ?? '?'
  ;(undefined_ ? out.imports : out.functions).set(name, type)
}

// An undefined symbol without an explicit name goes by its import's field name.
function symbolName(reader: Reader, flags: number, field: string | undefined): string | undefined {
  const named = !(flags & FLAG_UNDEFINED) || flags & FLAG_EXPLICIT_NAME
  return named ? reader.text() : field
}

export function readWasmSymbols(bytes: Uint8Array, name: string): WasmSymbols {
  const sections = readSections(bytes, name)
  const reader = sections.linking
  if (reader === undefined) throw new Error(`${name} has no linking section; emcc -c writes one`)
  const out: WasmSymbols = { name, functions: new Map(), imports: new Map(), data: new Set() }
  reader.uleb()
  while (reader.at < reader.bytes.length) {
    const type = reader.u8()
    const end = reader.uleb() + reader.at
    if (type === SYMTAB) {
      const count = reader.uleb()
      for (let i = 0; i < count; i++) readSymbol(reader, sections, out)
    }
    reader.at = end
  }
  return out
}

export interface WasmLookup {
  functions: Map<string, string>
  data: Set<string>
}

// Two definitions of one name must agree on its type (review U1).
function definitions(objects: readonly WasmSymbols[]): Map<string, string> {
  const functions = new Map<string, string>()
  const definedIn = new Map<string, string>()
  for (const object of objects) {
    for (const [name, type] of object.functions) {
      const known = functions.get(name)
      if (known !== undefined && known !== type) {
        const first = definedIn.get(name) ?? ''
        throw new Error(`${name} is ${known} in ${first} and ${type} in ${object.name}`)
      }
      functions.set(name, type)
      definedIn.set(name, object.name)
    }
  }
  return functions
}

// A definition gives the signature; an import stands in for a function no object defines.
export function mergeWasmSymbols(objects: readonly WasmSymbols[]): WasmLookup {
  const functions = definitions(objects)
  const data = new Set(objects.flatMap((object) => [...object.data]))
  for (const object of objects) {
    for (const [name, type] of object.imports) if (!functions.has(name)) functions.set(name, type)
  }
  return { functions, data }
}
