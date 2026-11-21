// npm run gen3:tables: the number and name tables in src/gen3/tables/ from the pinned expansion
// (plan §4, ruling D3). It reads the tree that readerTree names, refuses one whose HEAD is not
// the commit in rom/gen3/build.json, and writes JSON with constant names, numbers and display
// names and nothing else of the expansion's files. The devbox spec regenerates and compares.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  parseCharmap,
  parseDefine,
  parseDisplayNames,
  parseEnum,
  parseIncludes,
} from './gen3-parse.ts'
import { runCli } from './rom-cli.ts'
import { loadBuildConfig } from './rom-config.ts'
import type { UpstreamPin } from './rom-config.ts'
import { git } from './rom-git.ts'
import { readerTree, REPO_DIR } from './rom-paths.ts'

export const TABLES_DIR = join(REPO_DIR, 'src', 'gen3', 'tables')

/** Reads a file of the pinned tree by its path inside the tree. */
type ReadTree = (path: string) => string

interface ContentTable {
  readonly table: string
  readonly header: string
  readonly enumName: string
  readonly prefix: string
  readonly field: string
  readonly data: (read: ReadTree) => string[]
  /** The enum's entry that counts its constants; the ROM's validator bounds numbers by it. */
  readonly count: string
}

const SPECIES_INFO = 'src/data/pokemon/species_info.h'

// species_info.h includes one file per generation; the list comes from its #include lines.
function speciesFiles(read: ReadTree): string[] {
  const included = parseIncludes(read(SPECIES_INFO), 'species_info/')
  return [SPECIES_INFO, ...included.map((path) => `src/data/pokemon/${path}`)]
}

const CONTENT: readonly ContentTable[] = [
  {
    table: 'species',
    header: 'include/constants/species.h',
    enumName: 'Species',
    prefix: 'SPECIES',
    field: 'speciesName',
    data: speciesFiles,
    count: 'NUM_SPECIES',
  },
  {
    table: 'moves',
    header: 'include/constants/moves.h',
    enumName: 'Move',
    prefix: 'MOVE',
    field: 'name',
    data: () => ['src/data/moves_info.h'],
    count: 'MOVES_COUNT_ALL',
  },
  {
    table: 'abilities',
    header: 'include/constants/abilities.h',
    enumName: 'Ability',
    prefix: 'ABILITY',
    field: 'name',
    data: () => ['src/data/abilities.h'],
    count: 'ABILITIES_COUNT',
  },
  {
    table: 'items',
    header: 'include/constants/items.h',
    enumName: 'Item',
    prefix: 'ITEM',
    field: 'name',
    data: () => ['src/data/items.h'],
    count: 'ITEMS_COUNT',
  },
]

const TRAINER_PICS = {
  header: 'include/constants/trainers.h',
  enumName: 'TrainerPicID',
  count: 'TRAINER_PIC_COUNT',
}

const LEVEL_CAP = { header: 'include/constants/pokemon.h', define: 'MAX_LEVEL' }

export const TABLE_FILES = [
  ...CONTENT.map((content) => `${content.table}.json`),
  'trainer-pics.json',
  'counts.json',
  'charmap.json',
  'meta.json',
] as const

/** Objects one key a line, arrays on one line: Prettier's JSON for the shapes of these tables. */
export function jsonText(value: unknown, indent = ''): string {
  const inner = `${indent}  `
  if (Array.isArray(value)) return `[${value.map((item) => jsonText(item, indent)).join(', ')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  const entries = Object.entries(value).map(
    ([key, item]) => `${inner}${JSON.stringify(key)}: ${jsonText(item, inner)}`,
  )
  const text = entries.length === 0 ? '{}' : `{\n${entries.join(',\n')}\n${indent}}`
  return indent === '' ? `${text}\n` : text
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function listNote(table: string, what: string, names: string[]): string[] {
  return names.length === 0
    ? []
    : [`${table}: ${String(names.length)} ${what}: ${names.join(', ')}`]
}

function displayNames(read: ReadTree, content: ContentTable): Map<string, string> {
  const names = new Map<string, string>()
  for (const path of content.data(read)) {
    for (const [constant, name] of parseDisplayNames(read(path), content.prefix, content.field)) {
      const known = names.get(constant)
      if (known !== undefined && known !== name) {
        throw new Error(`${path}: ${constant} is "${known}" and "${name}"`)
      }
      names.set(constant, name)
    }
  }
  return names
}

// Aliases share their number, so names go by number: SPECIES_FLABEBE is Flabébé as well.
function contentTable(read: ReadTree, content: ContentTable, notes: string[]): object {
  const values = parseEnum(read(content.header), content.enumName)
  const names = displayNames(read, content)
  const byNumber = new Map<number, string>()
  const outside: string[] = []
  for (const [constant, name] of names) {
    const number = values.get(constant)
    if (number === undefined) outside.push(constant)
    else byNumber.set(number, name)
  }
  const constants = [...values].filter(([constant]) => constant.startsWith(`${content.prefix}_`))
  const nameless = constants.filter(([, number]) => !byNumber.has(number))
  notes.push(...listNote(content.table, 'display names for constants outside the enum', outside))
  notes.push(
    ...listNote(
      content.table,
      'constants without a display name',
      nameless.map(([c]) => c),
    ),
  )
  return Object.fromEntries(
    constants.map(([constant, number]) => [constant, [number, byNumber.get(number) ?? null]]),
  )
}

function trainerPics(read: ReadTree): object {
  const values = parseEnum(read(TRAINER_PICS.header), TRAINER_PICS.enumName)
  return Object.fromEntries([...values].filter(([constant]) => constant.startsWith('TRAINER_PIC_')))
}

// The bounds of a stream's numbers, by the expansion's own names: each content enum's count, the
// trainer pics' count and the level cap.
function counts(read: ReadTree): Record<string, number> {
  const found: Record<string, number> = {}
  for (const { header, enumName, count } of [...CONTENT, TRAINER_PICS]) {
    const value = parseEnum(read(header), enumName).get(count)
    if (value === undefined) throw new Error(`${header}: enum ${enumName} has no ${count}`)
    found[count] = value
  }
  found[LEVEL_CAP.define] = parseDefine(read(LEVEL_CAP.header), LEVEL_CAP.define)
  return found
}

export interface GeneratedTables {
  /** File name in src/gen3/tables/ to its text. */
  readonly files: Record<string, string>
  /** What the tables leave out, for the generator's report. */
  readonly notes: string[]
}

export function generateTables(read: ReadTree, pin: UpstreamPin): GeneratedTables {
  const hashes = new Map<string, string>()
  const recorded: ReadTree = (path) => {
    const text = read(path)
    hashes.set(path, sha256(text))
    return text
  }
  const notes: string[] = []
  const files: Record<string, string> = {}
  for (const content of CONTENT) {
    files[`${content.table}.json`] = jsonText(contentTable(recorded, content, notes))
  }
  files['trainer-pics.json'] = jsonText(trainerPics(recorded))
  files['counts.json'] = jsonText(counts(recorded))
  files['charmap.json'] = jsonText(parseCharmap(recorded('charmap.txt')))
  const sorted = [...hashes].sort(([a], [b]) => (a < b ? -1 : 1))
  files['meta.json'] = jsonText({
    tag: pin.tag,
    commit: pin.commit,
    files: Object.fromEntries(sorted),
  })
  return { files, notes }
}

export function checkPin(tree: string, head: string, pin: UpstreamPin): void {
  if (head.trim() !== pin.commit) {
    throw new Error(
      `the tree ${tree} is at ${head.trim()}, not at ${pin.commit} from rom/gen3/build.json`,
    )
  }
}

function main(): void {
  runCli('gen3:tables', () => {
    const tree = readerTree()
    if (!existsSync(tree)) throw new Error(`no pinned tree at ${tree}; set IRV_EXPANSION_TREE`)
    const pin = loadBuildConfig().upstream
    checkPin(tree, git(tree, ['rev-parse', 'HEAD']), pin)
    const { files, notes } = generateTables((path) => readFileSync(join(tree, path), 'utf8'), pin)
    for (const [name, text] of Object.entries(files)) writeFileSync(join(TABLES_DIR, name), text)
    for (const note of notes) process.stdout.write(`${note}\n`)
    process.stdout.write(`gen3:tables: ${String(TABLE_FILES.length)} files in ${TABLES_DIR}\n`)
  })
}

if (import.meta.main) main()
