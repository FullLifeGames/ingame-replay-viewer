// The typed-literal check (#138): every object literal that a spec under scripts/, src/gen5/ or
// src/web/gen5/ writes as a type of src/gen5/bw2-numbers.ts, through `as`, `satisfies` or its
// context, against build/gen5/bw2.json at that type's places. It follows the fixtures' guard's
// rules (scripts/gen5-numbers-compare.ts), where a value from 0 to 3 counts like a large one and
// the header says why. The literals come from the TypeScript compiler, so the scene specs run on
// every machine; the walk over the specs skips without the generated file and fails under CI
// without it. CI's log is public, so a failure names the file, the line and the member path.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BW2_NUMBERS_VERSION } from '../src/gen5/bw2-numbers.ts'
import {
  type LiteralFinding,
  literalFindings,
  literalProgram,
  specFiles,
  type TypedLiteral,
  typedLiterals,
} from './gen5-literals.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// The compiler reads the specs and their imports, about 900 files: 6 to 7 s alone and 15 s for the
// whole walk here, twice that under a second heavy run.
const PROGRAM_LIMIT = 120_000

/** A finding as the spec prints it: the file, the line and the member path, never a value. */
const shown = ({ file, line, name }: LiteralFinding) => `${file}:${String(line)} ${name}`

// Scene: CI must never pass with the walk over the specs skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

// An invented "generated" file: the scenes' literals meet it, never build/gen5/bw2.json.
const GENERATED = {
  version: BW2_NUMBERS_VERSION,
  symbols: { sTable: { name: 'sTable', kind: 'data', address: 0x02001000, module: 'ov9' } },
  argFormats: {
    ARGS_A: {
      code: 40,
      argCount: 1,
      puts: [{ bytes: 1, fields: [{ arg: 0, mask: 9, shift: 0 }] }],
    },
    ARGS_B: {
      code: 41,
      argCount: 2,
      puts: [{ bytes: 2, fields: [{ arg: 1, mask: 99, shift: 4 }] }],
    },
  },
  battle: {
    pokeCon: {
      size: 0x40,
      align: 4,
      fields: { forServer: { offset: 0, size: 2 }, parties: { offset: 8, size: 4 } },
    },
    monCore: { size: 0x40, align: 4, fields: { monId: { offset: 0x31, size: 1 } } },
    single: { clientCount: 9, posClientIds: [5, 6], clients: { player: 7, opponent: 1 } },
  },
  entry: { setupIndices: { player: 2, opponent: 3 } },
}

const NUMBERS_TYPES = join(GEN5_PATHS.repo, 'src/gen5/bw2-numbers.ts')

/** The scenes' spec texts, each written to a file of its own in a temporary folder. */
const SCENES = {
  hidden: [
    `export const HIDDEN = {`,
    `  version: ${String(BW2_NUMBERS_VERSION)},`,
    `  battle: { single: { clients: { player: 7, opponent: 5 } } },`,
    `} as unknown as Bw2Numbers`,
    `export const INVENTED = {`,
    `  battle: { single: { clients: { player: 8, opponent: 5 } } },`,
    `} as unknown as Bw2Numbers`,
  ],
  context: [
    `const read = (single: SingleBattle) => single.clientCount`,
    `export const BY_SATISFIES = {`,
    `  clientCount: 9, posClientIds: [4, 0], clients: { player: 4, opponent: 2 },`,
    `} satisfies SingleBattle`,
    `export const BY_PARAMETER = read({`,
    `  clientCount: 4, posClientIds: [5, 0], clients: { player: 4, opponent: 2 },`,
    `})`,
    `export const BY_TYPE: SingleBattle = {`,
    `  clientCount: 4, posClientIds: [4, 0], clients: { player: 7, opponent: 2 },`,
    `}`,
  ],
  fields: [
    `export const FIELDS = {`,
    `  pokeCon: { size: 0x50, align: 4, fields: { parties: { offset: 8, size: 2 } } },`,
    `} as unknown as BattleNumbers`,
    `export const FIRST = {`,
    `  pokeCon: { size: 0x50, align: 4, fields: { forServer: { offset: 0, size: 2 } } },`,
    `} as unknown as BattleNumbers`,
    `export const WIDE = {`,
    `  pokeCon: { size: 0x50, align: 4, fields: { forServer: { offset: 0, size: 4 } } },`,
    `} as unknown as BattleNumbers`,
  ],
  small: [
    `export const BY_KEY = { setupIndices: { player: 2, opponent: 0 } } as unknown as EntryNumbers`,
    `export const NO_KEY: Sides = { player: 2, opponent: 3 }`,
    `export const PUT: ArgPut = { bytes: 2, fields: [{ arg: 0, mask: 99, shift: 0 }] }`,
    `export const FORMATS = {`,
    `  argFormats: { ARGS_NEW: { code: 41, argCount: 2, puts: [] } },`,
    `} as unknown as ServerCmdTable`,
    `export const SYMBOLS: Bw2Symbol[] = [`,
    `  { name: 'sOther', kind: 'data', address: 0x02001000, module: 'ov9' },`,
    `  { name: 'sTable', kind: 'data', address: 0x02001000, module: 'ov9' },`,
    `]`,
  ],
  follow: [
    `const MON_ID_AT = 0x31`,
    `export const NUMBERS = {`,
    `  battle: { monCore: { size: 0x48, fields: { monId: { offset: MON_ID_AT, size: 1 } } } },`,
    `} as unknown as { battle: BattleNumbers }`,
    `const CORE = { size: 0x48, align: 4, fields: { monId: { offset: 0x30 + 1, size: 1 } } }`,
    `export const BY_CONST = { monCore: CORE } as unknown as BattleNumbers`,
    `const monCore = { size: 0x48, align: 4, fields: { monId: { offset: 7 * 7, size: 1 } } }`,
    `export const SHORT = { monCore } as unknown as BattleNumbers`,
  ],
}

const IMPORT = `import type { ArgPut, BattleNumbers, Bw2Numbers, Bw2Symbol, EntryNumbers, ServerCmdTable, Sides, SingleBattle } from '${NUMBERS_TYPES}'`

describe('the typed-literal check on invented specs', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gen5-literals-'))
  let literals: TypedLiteral[] = []

  beforeAll(() => {
    const files = Object.entries(SCENES).map(([name, lines]) => {
      const file = join(folder, `${name}.test.ts`)
      writeFileSync(file, [IMPORT, ...lines, ''].join('\n'))
      return file
    })
    literals = typedLiterals(literalProgram(files), files)
  }, PROGRAM_LIMIT)
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true })
  })

  /** The findings of one scene file, as `line path`. */
  const found = (scene: keyof typeof SCENES) =>
    literalFindings(
      literals.filter(({ file }) => file.endsWith(`/${scene}.test.ts`)),
      GENERATED,
    ).map(({ line, name }) => `${String(line)} ${name}`)

  // Scene: a spec that hides its literal behind `as unknown as Bw2Numbers` must not pass by it; the
  // root's version is the number of our own shape.
  it('names a literal whose member sits at its generated path, by file, line and path', () => {
    expect(found('hidden')).toEqual(['2 Bw2Numbers.battle.single.clients.player'])
  })

  it('passes the same literal with invented numbers', () => {
    const invented = literals.filter(
      ({ file, line }) => file.endsWith('/hidden.test.ts') && line > 5,
    )
    expect(invented).toHaveLength(1)
    expect(literalFindings(invented, GENERATED)).toEqual([])
  })

  it('reads a literal typed by its context, by `satisfies` and by a parameter', () => {
    expect(found('context')).toEqual([
      '3 SingleBattle.clientCount',
      '6 SingleBattle.posClientIds.0',
      '9 SingleBattle.clients.player',
    ])
  })

  it('names a field at its real place whatever its size, and a first member only in its real width', () => {
    expect(found('fields')).toEqual([
      '2 BattleNumbers.pokeCon.fields.parties',
      '5 BattleNumbers.pokeCon.fields.forServer',
    ])
  })

  // Scene: a Sides by its key in an entry's literal stands at one place, a bare one at two; an
  // invented packer's `arg: 0` meets a real put by construction, its mask by a fact.
  it('counts a small value on a fixed path, and skips it at several places', () => {
    expect(found('small')).toEqual([
      '2 EntryNumbers.setupIndices.player',
      '4 ArgPut.fields.0.mask',
      '10 Bw2Symbol.address',
    ])
  })

  it('follows a const of the same file, a shorthand member and a constant expression', () => {
    expect(found('follow')).toEqual([
      '4 BattleNumbers.monCore.fields.monId',
      '7 BattleNumbers.monCore.fields.monId',
      '9 BattleNumbers.monCore.fields.monId',
    ])
  })
})

describe.skipIf(!existsSync(FILE))('the typed literals of the specs on the real numbers', () => {
  const files = specFiles()
  let literals: TypedLiteral[] = []

  beforeAll(() => {
    literals = typedLiterals(literalProgram(files), files)
  }, PROGRAM_LIMIT)

  // Scene: a walk that reads no spec would pass on anything.
  it('reads the specs of its folders and their typed literals', () => {
    expect(files.filter((file) => file.includes('/src/web/gen5/')).length).toBeGreaterThan(0)
    expect(literals.some(({ file }) => file === 'src/gen5/server-cmd.test.ts')).toBe(true)
  })

  it('finds no typed literal in the specs that equals the generated file', () => {
    const real: unknown = JSON.parse(readFileSync(FILE, 'utf8'))
    expect(literalFindings(literals, real).map(shown)).toEqual([])
  })
})
