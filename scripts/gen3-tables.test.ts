import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadBuildConfig } from './rom-config.ts'
import { git } from './rom-git.ts'
import { readerTree } from './rom-paths.ts'
import { checkPin, generateTables, jsonText, TABLE_FILES, TABLES_DIR } from './gen3-tables.ts'

const PIN = {
  repository: 'https://example.invalid/x.git',
  tag: 'expansion/9.9.9',
  commit: 'a'.repeat(40),
}

const enumOf = (name: string, lines: string[]) => `enum ${name}\n{\n${lines.join('\n')}\n};\n`

// A pinned tree in miniature: every file the generator reads, a few entries each.
const TREE: Record<string, string> = {
  'include/constants/species.h': enumOf('Species', [
    'SPECIES_NONE = 0,',
    'SPECIES_NIDORAN_F = 29,',
    'SPECIES_ALIAS = SPECIES_NIDORAN_F,',
    'SPECIES_EGG,',
    'NUM_SPECIES = SPECIES_EGG,',
  ]),
  'include/constants/moves.h': enumOf('Move', [
    'MOVE_NONE = 0,',
    'MOVE_POUND = 1,',
    'MOVES_COUNT,',
    'FIRST_MAX_MOVE = 5,',
    'MOVES_COUNT_ALL,',
  ]),
  'include/constants/abilities.h': enumOf('Ability', [
    'ABILITY_NONE = 0,',
    'ABILITY_STENCH,',
    'ABILITIES_COUNT,',
  ]),
  'include/constants/items.h': enumOf('Item', [
    'ITEM_NONE = 0,',
    'ITEM_POKE_BALL = 4,',
    'ITEMS_COUNT,',
  ]),
  'include/constants/trainers.h': enumOf('TrainerPicID', [
    'TRAINER_PIC_NONE,',
    'TRAINER_PIC_BRENDAN,',
    'TRAINER_PIC_COUNT,',
  ]),
  'include/constants/pokemon.h': '#define MAX_LEVEL 100\n',
  'src/data/pokemon/species_info.h': [
    '#include "constants/abilities.h"',
    '[SPECIES_NONE] = { .speciesName = _("??????????") },',
    '#include "species_info/gen_1_families.h"',
  ].join('\n'),
  'src/data/pokemon/species_info/gen_1_families.h':
    '[SPECIES_NIDORAN_F] = { .speciesName = _("Nidoran♀") },\n',
  'src/data/moves_info.h':
    '[MOVE_POUND] = { .name = COMPOUND_STRING("Pound") },\n[MOVE_TM_X] = { .name = COMPOUND_STRING("X") },\n',
  'src/data/abilities.h': '[ABILITY_STENCH] = { .name = _("Stench") },\n',
  'src/data/items.h': '[ITEM_POKE_BALL] = { .name = ITEM_NAME("Poké Ball") },\n',
  'charmap.txt': "' ' = 00\n'A' = BB\nNBSP = 39\n'$' = FF\n@ Hiragana\n'お' = 05\n",
}

function readTree(path: string): string {
  const text = TREE[path]
  if (text === undefined) throw new Error(`no ${path} in the test tree`)
  return text
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

describe('checkPin', () => {
  it('accepts the pinned commit and refuses any other', () => {
    expect(() => {
      checkPin('/tree', `${PIN.commit}\n`, PIN)
    }).not.toThrow()
    expect(() => {
      checkPin('/tree', 'b'.repeat(40), PIN)
    }).toThrow(/\/tree is at b{40}, not at a{40} from rom\/gen3\/build.json/)
  })
})

describe('generateTables on a small tree', () => {
  const { files, notes } = generateTables(readTree, PIN)
  const parsed = (name: string): unknown => JSON.parse(files[name] ?? 'null')

  it('writes every table file', () => {
    expect(Object.keys(files).sort()).toEqual([...TABLE_FILES].sort())
  })

  it('keys numbers and display names by constant, aliases kept, names by number', () => {
    expect(parsed('species.json')).toEqual({
      SPECIES_NONE: [0, '??????????'],
      SPECIES_NIDORAN_F: [29, 'Nidoran♀'],
      SPECIES_ALIAS: [29, 'Nidoran♀'],
      SPECIES_EGG: [30, null],
    })
    expect(parsed('items.json')).toEqual({ ITEM_NONE: [0, null], ITEM_POKE_BALL: [4, 'Poké Ball'] })
    expect(parsed('trainer-pics.json')).toEqual({
      TRAINER_PIC_NONE: 0,
      TRAINER_PIC_BRENDAN: 1,
      TRAINER_PIC_COUNT: 2,
    })
    expect(parsed('charmap.json')).toEqual({
      eos: 255,
      chars: { ' ': 0, A: 187 },
      named: { NBSP: [57] },
    })
  })

  it('writes the counts and the level cap that bound the numbers of a stream', () => {
    expect(parsed('counts.json')).toEqual({
      NUM_SPECIES: 30,
      MOVES_COUNT_ALL: 6,
      ABILITIES_COUNT: 2,
      ITEMS_COUNT: 5,
      TRAINER_PIC_COUNT: 2,
      MAX_LEVEL: 100,
    })
  })

  it('refuses a tree whose enum lacks its count', () => {
    const read = (path: string) =>
      path.endsWith('items.h') ? enumOf('Item', ['ITEM_NONE = 0,']) : readTree(path)
    expect(() => generateTables(read, PIN)).toThrow(/enum Item has no ITEMS_COUNT/)
  })

  it('records the pin and the sha256 of each file read', () => {
    expect(parsed('meta.json')).toEqual({
      tag: PIN.tag,
      commit: PIN.commit,
      files: Object.fromEntries(
        Object.keys(TREE)
          .sort()
          .map((path) => [path, sha256(readTree(path))]),
      ),
    })
  })

  it('lists the constants without a name and the names without a constant', () => {
    expect(notes).toEqual([
      'species: 1 constants without a display name: SPECIES_EGG',
      'moves: 1 display names for constants outside the enum: MOVE_TM_X',
      'moves: 1 constants without a display name: MOVE_NONE',
      'abilities: 1 constants without a display name: ABILITY_NONE',
      'items: 1 constants without a display name: ITEM_NONE',
    ])
  })
})

describe('jsonText', () => {
  it('writes objects one key a line and short arrays on one line, as Prettier does', () => {
    expect(jsonText({ a: [1, 'x', null], b: { c: 2 }, d: {} })).toBe(
      '{\n  "a": [1, "x", null],\n  "b": {\n    "c": 2\n  },\n  "d": {}\n}\n',
    )
  })
})

// Devbox only: CI has no 600 MB checkout, so the committed tables stand in for it there.
const tree = readerTree()
describe.skipIf(!existsSync(tree))('the committed tables (T7, devbox)', () => {
  it('equal the tables generated from the pinned tree', () => {
    const pin = loadBuildConfig().upstream
    checkPin(tree, git(tree, ['rev-parse', 'HEAD']), pin)
    const { files } = generateTables((path) => readFileSync(join(tree, path), 'utf8'), pin)
    for (const name of TABLE_FILES) {
      const committed: unknown = JSON.parse(readFileSync(join(TABLES_DIR, name), 'utf8'))
      expect(JSON.parse(files[name] ?? 'null'), name).toEqual(committed)
    }
  })
})
