// The invented fixtures of the Gen 5 specs (#97) against pokebw2's real numbers in
// build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout. A fixture
// carries pokebw2's names with numbers made up for the specs, and none of them may equal the
// generated number under the same name: else the tracked fixture would hold pokebw2's layout. CI
// fetches the pin and generates the file before the check, so there a missing file fails the guard;
// on a machine without it the spec skips. CI's log is public, so a failure lists names alone.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { ENTRY } from '../src/gen5/direct-entry.fixtures.ts'
import { PKM, TERMINATOR } from '../src/gen5/pkm.fixtures.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

/** Each fixture under pokebw2's names: its module, its export, and where the generated file keeps
 * the numbers of the same names. */
const COMPARED = [
  { module: 'pkm.fixtures.ts', name: 'PKM', value: PKM, path: ['pkm'] },
  {
    module: 'pkm.fixtures.ts',
    name: 'TERMINATOR',
    value: TERMINATOR,
    path: ['entry', 'constants', 'CHAR_EOM'],
  },
  { module: 'direct-entry.fixtures.ts', name: 'ENTRY', value: ENTRY, path: ['entry'] },
]

/** The fixture modules that hold no number of pokebw2: the archives' fixtures. `ROUTINE` beside
 * `ENTRY` stays out of the compare too: it is the build of our own routine, not pokebw2's. */
const NOT_POKEBW2 = ['lzma.fixtures.ts', 'seven-zip.fixtures.ts']

// Scene: CI must never pass with the spec on the real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A struct's field: an offset and a size, maybe a bit and a width. */
const isField = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && typeof value.offset === 'number' && typeof value.size === 'number'

const sameField = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  (['offset', 'size', 'bit', 'bits'] as const).every((key) => a[key] === b[key])

/** Every name under `name` whose fixture number equals the generated number at the same place: a
 * field equal in offset, size, bit and bits, or any other number. */
function equalNames(fixture: unknown, real: unknown, name: string): string[] {
  if (typeof fixture === 'number') return fixture === real ? [name] : []
  if (isField(fixture) && isField(real)) return sameField(fixture, real) ? [name] : []
  if (!isObject(fixture) || !isObject(real)) return []
  return Object.keys(fixture)
    .filter((key) => key in real)
    .flatMap((key) => equalNames(fixture[key], real[key], `${name}.${key}`))
}

const at = (root: unknown, path: string[]) =>
  path.reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), root)

describe('the fixtures under the guard', () => {
  // Scene: a new fixture module with pokebw2's names must not slip past the compare below.
  it('compares every fixture module of src/gen5 or names it as no pokebw2 fixture', () => {
    const modules = readdirSync(new URL('../src/gen5/', import.meta.url)).filter((file) =>
      file.endsWith('.fixtures.ts'),
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
