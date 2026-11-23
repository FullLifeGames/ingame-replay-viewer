// Measures what a visitor downloads (#17): the raw, gzip 9 and brotli 11 sizes of named files, and
// a census of an ELF's symbols by class, with the bytes of species up to 386 (the ones a retail
// dump of Emerald holds) apart. It prints Markdown tables and writes nothing.
//   node scripts/patch-sizes.ts <file...> [--elf <elf>]
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

import { Dex } from '@pkmn/dex'

export interface FileSizes {
  readonly name: string
  readonly raw: number
  readonly gzip: number
  readonly brotli: number
}

export interface NmSymbol {
  readonly name: string
  readonly type: string
  readonly size: number
}

export type SymbolClass =
  | 'cries'
  | 'pokemonGraphics'
  | 'code'
  | 'otherSound'
  | 'battleAnimGraphics'
  | 'trainerGraphics'
  | 'other'

export interface ClassTotal {
  readonly symbolClass: SymbolClass
  readonly symbols: number
  readonly bytes: number
  readonly retailBytes: number
}

const RETAIL_GEN = 3
const RETAIL_LAST_SPECIES = 386
// bss holds no bytes in the image; weak and plain functions are code.
const BSS_TYPES = new Set(['b', 'B'])
const CODE_TYPES = new Set(['t', 'T', 'w', 'W'])
// The expansion's symbol prefixes for each species' assets, and whether retail Emerald has the kind.
const SPECIES_PREFIXES: readonly (readonly [string, SymbolClass, boolean])[] = [
  ['Cry_', 'cries', true],
  ['gMonFrontPic_', 'pokemonGraphics', true],
  ['gMonBackPic_', 'pokemonGraphics', true],
  ['gMonIcon_', 'pokemonGraphics', true],
  ['gMonPalette_', 'pokemonGraphics', true],
  ['gMonShinyPalette_', 'pokemonGraphics', true],
  ['gMonFootprint_', 'pokemonGraphics', true],
  ['gOverworldPalette_', 'pokemonGraphics', false],
  ['gShinyOverworldPalette_', 'pokemonGraphics', false],
]
// gObjectEventPic_ holds people too; only a pic named after a species is a Pokémon graphic.
const OBJECT_EVENT_PIC = 'gObjectEventPic_'
const CLASS_PREFIXES: readonly (readonly [string, SymbolClass])[] = [
  ['DirectSoundWaveData_', 'otherSound'],
  ['ProgrammableWaveData_', 'otherSound'],
  ['voicegroup', 'otherSound'],
  ['mus_', 'otherSound'],
  ['se_', 'otherSound'],
  ['ph_', 'otherSound'],
  ['gBattleAnimSprite', 'battleAnimGraphics'],
  ['gBattleAnimBg', 'battleAnimGraphics'],
  ['gBattleAnimMask', 'battleAnimGraphics'],
  ['gBattleAnimUnusedGfx_', 'battleAnimGraphics'],
  ['gBattleAnimUnusedPal_', 'battleAnimGraphics'],
  ['gBattleAnimUnusedTilemap_', 'battleAnimGraphics'],
  ['gTrainerFrontPic_', 'trainerGraphics'],
  ['gTrainerBackPic_', 'trainerGraphics'],
  ['gTrainerPalette_', 'trainerGraphics'],
  ['gTrainerBackPicPalette_', 'trainerGraphics'],
]
const CLASS_LABELS: Readonly<Record<SymbolClass, string>> = {
  cries: 'cries',
  pokemonGraphics: 'Pokémon graphics',
  code: 'code',
  otherSound: 'other sound',
  battleAnimGraphics: 'battle animation graphics',
  trainerGraphics: 'trainer graphics',
  other: 'other',
}

/**
 * A species name as the expansion spells it in a symbol, in lower case: no accents, spaces or
 * punctuation (Jangmo-o is JangmoO there).
 */
function symbolSpelling(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
}

/** Species, Gen 3 formes and cosmetic formes up to 386, as the expansion spells them. */
const RETAIL_NAMES: ReadonlySet<string> = new Set(
  Dex.forGen(RETAIL_GEN)
    .species.all()
    .filter((species) => species.isNonstandard === null && species.num <= RETAIL_LAST_SPECIES)
    .flatMap((species) => [species.name, ...(species.cosmeticFormes ?? [])])
    .map(symbolSpelling),
)

/** Every base species of every generation, for telling a Pokémon's overworld pic from a person's. */
const SPECIES_NAMES: readonly string[] = [
  ...new Set(Dex.species.all().map((species) => symbolSpelling(species.baseSpecies))),
]

export function fileSizes(name: string, data: Uint8Array): FileSizes {
  return {
    name,
    raw: data.length,
    gzip: gzipSync(data, { level: 9 }).length,
    brotli: brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  }
}

// One line of `nm -P -t x`: name, type, value and size in hex; a symbol without a size lacks the last.
const NM_LINE = /^(\S+) (\S) [0-9a-f]+(?: ([0-9a-f]+))?$/i

/** The symbols of `nm -P -t x` that have a size; a symbol without a size holds no bytes. */
export function parseNm(text: string): NmSymbol[] {
  const symbols: NmSymbol[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const match = NM_LINE.exec(line.trim())
    if (match === null) throw new Error(`not an nm line: ${line}`)
    const [, name = '', type = '', size] = match
    if (size !== undefined) symbols.push({ name, type, size: Number.parseInt(size, 16) })
  }
  return symbols
}

export function classify(symbol: NmSymbol): { symbolClass: SymbolClass; retail: boolean } {
  if (CODE_TYPES.has(symbol.type)) return { symbolClass: 'code', retail: false }
  for (const [prefix, symbolClass, retailKind] of SPECIES_PREFIXES) {
    if (!symbol.name.startsWith(prefix)) continue
    const retail = retailKind && RETAIL_NAMES.has(symbolSpelling(symbol.name.slice(prefix.length)))
    return { symbolClass, retail }
  }
  if (symbol.name.startsWith(OBJECT_EVENT_PIC)) {
    const suffix = symbolSpelling(symbol.name.slice(OBJECT_EVENT_PIC.length))
    const pokemon = SPECIES_NAMES.some((species) => suffix.startsWith(species))
    return { symbolClass: pokemon ? 'pokemonGraphics' : 'other', retail: false }
  }
  const match = CLASS_PREFIXES.find(([prefix]) => symbol.name.startsWith(prefix))
  return { symbolClass: match?.[1] ?? 'other', retail: false }
}

export function census(symbols: readonly NmSymbol[]): ClassTotal[] {
  const totals = new Map(
    (Object.keys(CLASS_LABELS) as SymbolClass[]).map((symbolClass) => [
      symbolClass,
      { symbolClass, symbols: 0, bytes: 0, retailBytes: 0 },
    ]),
  )
  for (const symbol of symbols) {
    if (BSS_TYPES.has(symbol.type)) continue
    const { symbolClass, retail } = classify(symbol)
    const total = totals.get(symbolClass)
    if (total === undefined) throw new Error(`no class ${symbolClass}`)
    total.symbols += 1
    total.bytes += symbol.size
    if (retail) total.retailBytes += symbol.size
  }
  return [...totals.values()]
}

function count(value: number): string {
  return value.toLocaleString('en-US')
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const align = head.map((_, column) => (column === 0 ? '---' : '---:'))
  return [head, align, ...rows].map((cells) => `| ${cells.join(' | ')} |`).join('\n')
}

export function sizeTable(files: readonly FileSizes[]): string {
  const rows = files.map((file) => [
    file.name,
    count(file.raw),
    count(file.gzip),
    count(file.brotli),
  ])
  return table(['File', 'Raw', 'gzip 9', 'brotli 11'], rows)
}

export function censusTable(totals: readonly ClassTotal[]): string {
  const rows = totals.map((total) => [
    CLASS_LABELS[total.symbolClass],
    count(total.symbols),
    count(total.bytes),
    count(total.retailBytes),
  ])
  const sum = (pick: (total: ClassTotal) => number) =>
    count(totals.reduce((acc, total) => acc + pick(total), 0))
  rows.push(['**total**', sum((t) => t.symbols), sum((t) => t.bytes), sum((t) => t.retailBytes)])
  return table(['Class', 'Symbols', 'Bytes', 'Species up to 386'], rows)
}

/**
 * nm's symbols with sizes. `--size-sort` gives the labels of the assembly files (cries, songs,
 * voicegroups) a size too: the distance to the next symbol. rom-build's nmOutput leaves them out.
 */
function sizedNmOutput(elfPath: string): string {
  const result = spawnSync('arm-none-eabi-nm', ['-P', '-t', 'x', '--size-sort', elfPath], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`arm-none-eabi-nm failed: ${result.stderr.trim()}`)
  return result.stdout
}

export function parseSizesArgs(args: readonly string[]): {
  files: string[]
  elf: string | undefined
} {
  const usage = 'usage: node scripts/patch-sizes.ts <file...> [--elf <elf>]'
  const files: string[] = []
  let elf: string | undefined
  for (let at = 0; at < args.length; at++) {
    if (args[at] !== '--elf') {
      files.push(args[at] ?? '')
      continue
    }
    elf = args[++at]
    if (elf === undefined) throw new Error(usage)
  }
  if (files.length === 0) throw new Error(usage)
  return { files, elf }
}

function main(): void {
  const { files, elf } = parseSizesArgs(process.argv.slice(2))
  const say = (text: string) => process.stdout.write(`${text}\n`)
  say(sizeTable(files.map((file) => fileSizes(file, readFileSync(file)))))
  if (elf === undefined) return
  say(`\nSymbols of ${elf} by class (bss left out):\n`)
  say(censusTable(census(parseNm(sizedNmOutput(elf)))))
}

if (import.meta.main) main()
