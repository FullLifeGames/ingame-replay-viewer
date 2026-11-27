// The invented fixtures of the Gen 5 specs (#97) against pokebw2's real numbers in
// build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout. A fixture
// carries pokebw2's names with numbers made up for the specs: no field may sit at the generated
// place and no other number may equal the generated one under the same name, else the tracked
// fixture would hold pokebw2's layout (`sameField` says what a place is). CI
// fetches the pin and generates the file before the check, so there a missing file fails the guard;
// on a machine without it the spec skips. CI's log is public, so a failure lists names alone.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { ADAPTER_LAYOUT } from '../src/gen5/adapter.fixtures.ts'
import { ENTRY } from '../src/gen5/direct-entry.fixtures.ts'
import { PKM, TEAM_PKM, TERMINATOR } from '../src/gen5/pkm.fixtures.ts'
import { battleNumbers } from './gen5-bw2-battle.ts'
import { BATTLE_SOURCES } from './gen5-bw2-battle.fixtures.ts'
import { entryNumbers } from './gen5-bw2-entry.ts'
import { ENTRY_INPUT } from './gen5-bw2-entry.fixtures.ts'
import { fontNumbers } from './gen5-bw2-font.ts'
import { FONT_INPUT } from './gen5-bw2-font.fixtures.ts'
import { pkmNumbers } from './gen5-bw2-pkm.ts'
import { PKM_INPUT } from './gen5-bw2-pkm.fixtures.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { textNumbers } from './gen5-bw2-text.ts'
import { TEXT_INPUT } from './gen5-bw2-text.fixtures.ts'

const FILE = GEN5_PATHS.bw2Json

/** The folders whose `*.fixtures.ts` modules the guard walks. */
const FOLDERS = ['src/gen5/', 'scripts/']

/** Each fixture under pokebw2's names: its module, its export, and where the generated file keeps
 * the numbers of the same names. A fixture of C texts is compared by what its reader computes
 * from them. */
const COMPARED = [
  { module: 'src/gen5/pkm.fixtures.ts', name: 'PKM', value: PKM, path: ['pkm'] },
  { module: 'src/gen5/pkm.fixtures.ts', name: 'TEAM_PKM', value: TEAM_PKM, path: ['pkm'] },
  {
    module: 'src/gen5/pkm.fixtures.ts',
    name: 'TERMINATOR',
    value: TERMINATOR,
    path: ['entry', 'constants', 'CHAR_EOM'],
  },
  { module: 'src/gen5/direct-entry.fixtures.ts', name: 'ENTRY', value: ENTRY, path: ['entry'] },
  {
    module: 'src/gen5/adapter.fixtures.ts',
    name: 'ADAPTER_LAYOUT',
    value: ADAPTER_LAYOUT,
    path: ['adapter'],
  },
  {
    module: 'scripts/gen5-bw2-entry.fixtures.ts',
    name: 'ENTRY_INPUT',
    value: entryNumbers(ENTRY_INPUT),
    path: ['entry'],
  },
  {
    module: 'scripts/gen5-bw2-pkm.fixtures.ts',
    name: 'PKM_INPUT',
    value: pkmNumbers(PKM_INPUT),
    path: ['pkm'],
  },
  {
    module: 'scripts/gen5-bw2-battle.fixtures.ts',
    name: 'BATTLE_SOURCES',
    value: battleNumbers(BATTLE_SOURCES),
    path: ['battle'],
  },
  {
    module: 'scripts/gen5-bw2-font.fixtures.ts',
    name: 'FONT_INPUT',
    value: fontNumbers(FONT_INPUT),
    path: ['font'],
  },
  {
    module: 'scripts/gen5-bw2-text.fixtures.ts',
    name: 'TEXT_INPUT',
    value: textNumbers(TEXT_INPUT),
    path: ['text'],
  },
]

/** The fixture modules that hold no number of pokebw2: the archives' fixtures. `ROUTINE` beside
 * `ENTRY` stays out of the compare too: it is the build of our own routine, not pokebw2's. */
const NOT_POKEBW2 = ['src/gen5/lzma.fixtures.ts', 'src/gen5/seven-zip.fixtures.ts']

// Scene: CI must never pass with the spec on the real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A struct's field: an offset and a size, maybe a bit and a width. */
const isField = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && typeof value.offset === 'number' && typeof value.size === 'number'

/** A field's place: its offset and, for a bit field, its bit. */
const place = (field: Record<string, unknown>) => [field.offset, field.bit ?? 0]
const isZero = (field: Record<string, unknown>) => place(field).every((part) => part === 0)

/** A field shows the real layout at the real place, whatever its size; at offset 0 and bit 0,
 * where every struct starts, only in the real size and width too. */
function sameField(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const [offset, bit] = place(a)
  if (offset !== b.offset || bit !== (b.bit ?? 0)) return false
  return !isZero(a) || (a.size === b.size && a.bits === b.bits)
}

/** A struct's alignment: on the game's compiler 1, 2 or 4 by its widest member, so like a field's
 * width it says nothing on its own. */
const isAlign = (struct: Record<string, unknown>, key: string) =>
  key === 'align' && isObject(struct.fields)

/** Every name under `name` whose fixture number equals the generated number at the same place: a
 * field by `sameField`, or any other number but a struct's alignment. */
function equalNames(fixture: unknown, real: unknown, name: string): string[] {
  if (typeof fixture === 'number') return fixture === real ? [name] : []
  if (isField(fixture) && isField(real)) return sameField(fixture, real) ? [name] : []
  if (!isObject(fixture) || !isObject(real)) return []
  return Object.keys(fixture)
    .filter((key) => key in real && !isAlign(fixture, key))
    .flatMap((key) => equalNames(fixture[key], real[key], `${name}.${key}`))
}

const at = (root: unknown, path: string[]) =>
  path.reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), root)

describe("the guard's compare on invented numbers", () => {
  const real = { offset: 8, size: 4, bit: 3, bits: 5 }
  const first = { offset: 0, size: 2 }

  // Scene: widths of 1, 2 and 4 bytes meet in every layout, so a fixture field that keeps the real
  // place with a width of its own still shows the real layout and must fail.
  it('names a field at the real place with another size and width', () => {
    const fixture = { offset: 8, size: 2, bit: 3, bits: 1 }
    expect(equalNames(fixture, real, 'S.field')).toEqual(['S.field'])
  })

  it('passes a field at another offset or another bit with the real size', () => {
    expect(equalNames({ ...real, offset: 12 }, real, 'S.field')).toEqual([])
    expect(equalNames({ ...real, bit: 4 }, real, 'S.field')).toEqual([])
  })

  // Scene: every struct starts at offset 0, so a first member counts only in the real width too.
  it('names a field at offset 0 only in the real size and width', () => {
    expect(equalNames(first, first, 'S.first')).toEqual(['S.first'])
    expect(equalNames({ offset: 0, size: 4 }, first, 'S.first')).toEqual([])
    expect(equalNames({ offset: 0, size: 2, bit: 0, bits: 3 }, first, 'S.first')).toEqual([])
  })

  // Scene: on the game's compiler a struct's alignment is 1, 2 or 4 by its widest member, so a
  // struct of a pointer or a word shares it with every such struct, as a field's width does.
  it('passes a struct whose alignment alone equals the real one, and names its size', () => {
    const struct = { size: 12, align: 4, fields: { first } }
    expect(equalNames(struct, { ...struct, size: 16 }, 'S')).toEqual(['S.fields.first'])
    expect(equalNames(struct, struct, 'S')).toEqual(['S.size', 'S.fields.first'])
  })

  it('names any other number equal under the same name', () => {
    expect(equalNames({ COUNT: 6, CODE: 2 }, { COUNT: 6, CODE: 3 }, 'C')).toEqual(['C.COUNT'])
  })
})

describe('the fixtures under the guard', () => {
  // Scene: a new fixture module with pokebw2's names must not slip past the compare below.
  it('compares every fixture module of its folders or names it as no pokebw2 fixture', () => {
    const modules = FOLDERS.flatMap((folder) =>
      readdirSync(new URL(`../${folder}`, import.meta.url))
        .filter((file) => file.endsWith('.fixtures.ts'))
        .map((file) => `${folder}${file}`),
    )
    const known = new Set([...COMPARED.map(({ module }) => module), ...NOT_POKEBW2])
    expect(modules.filter((module) => !known.has(module))).toEqual([])
  })
})

describe.skipIf(!existsSync(FILE))('the invented fixtures on the real numbers', () => {
  let cached: Bw2Numbers | undefined
  const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

  it('finds each fixture its place in the generated file', () => {
    const missing = COMPARED.filter(({ path }) => at(real(), path) === undefined)
    expect(missing.map(({ name }) => name)).toEqual([])
  })

  for (const { module, name, value, path } of COMPARED) {
    // Scene: a fixture whose members sit in the real order with natural types gets the real
    // offsets for free; the guard names each such number so that it moves.
    it(`${module}: no number of ${name} equals the generated one`, () => {
      expect(equalNames(value, at(real(), path), name)).toEqual([])
    })
  }
})
