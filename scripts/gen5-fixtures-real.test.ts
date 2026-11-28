// The invented fixtures of the Gen 5 specs (#97) against pokebw2's real numbers in
// build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout. A fixture
// carries pokebw2's names with numbers made up for the specs: no field may sit at the generated
// place and no other number may equal the generated one under the same name, else the tracked
// fixture would hold pokebw2's layout. The rules live in scripts/gen5-numbers-compare.ts, which
// the typed-literal check shares; a value from 0 to 3 counts like a large one, and that header
// says why. CI fetches the pin and generates the file before the check, so there a missing file
// fails the guard; on a machine without it the spec skips. CI's log is public, so a failure lists
// names alone.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { ADAPTER_LAYOUT } from '../src/gen5/adapter.fixtures.ts'
import { BATTLE, ONE_CLIENT_TWICE, SWAPPED_SINGLE } from '../src/gen5/battle-mons.fixtures.ts'
import { REPLAY_NUMBERS } from '../src/gen5/backend/replay.fixtures.ts'
import { ENTRY } from '../src/gen5/direct-entry.fixtures.ts'
import { GAUGE, ODD_GAUGE } from '../src/gen5/hp-numbers.fixtures.ts'
import { PKM, TEAM_PKM, TERMINATOR } from '../src/gen5/pkm.fixtures.ts'
import { battleNumbers } from './gen5-bw2-battle.ts'
import { effectNumbers } from './gen5-bw2-effects.ts'
import { EFFECTS_CONSTANTS, EFFECTS_INPUT, EFFECTS_ITEMS } from './gen5-bw2-effects.fixtures.ts'
import { flowNumbers } from './gen5-bw2-flow.ts'
import { ROOMY_NUMBERS } from './gen5-moment-room.fixtures.ts'
import { FLOW_INPUT } from './gen5-bw2-flow.fixtures.ts'
import { BATTLE_SOURCES } from './gen5-bw2-battle.fixtures.ts'
import { entryNumbers } from './gen5-bw2-entry.ts'
import { ENTRY_INPUT } from './gen5-bw2-entry.fixtures.ts'
import { fontNumbers } from './gen5-bw2-font.ts'
import { FONT_INPUT } from './gen5-bw2-font.fixtures.ts'
import { gaugeNumbers } from './gen5-bw2-gauge.ts'
import { GAUGE_INPUT, ODD_READ_GAUGE } from './gen5-bw2-gauge.fixtures.ts'
import { pkmNumbers } from './gen5-bw2-pkm.ts'
import { PKM_INPUT } from './gen5-bw2-pkm.fixtures.ts'
import { REPORT_NUMBERS, REPORT_OUTSIDE } from './gen5-bw2-report.fixtures.ts'
import { at, namesAt } from './gen5-numbers-compare.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { textNumbers } from './gen5-bw2-text.ts'
import { TEXT_INPUT } from './gen5-bw2-text.fixtures.ts'
import { textBoxNumbers } from './gen5-bw2-textbox.ts'
import { TEXT_BOX_INPUT, TEXT_BOX_NUMBERS } from './gen5-bw2-textbox.fixtures.ts'

const FILE = GEN5_PATHS.bw2Json

/** The folders whose `*.fixtures.ts` modules the guard walks. */
const FOLDERS = ['src/gen5/', 'src/gen5/backend/', 'scripts/']

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
  { module: 'src/gen5/battle-mons.fixtures.ts', name: 'BATTLE', value: BATTLE, path: ['battle'] },
  ...(
    [
      ['SWAPPED_SINGLE', SWAPPED_SINGLE],
      ['ONE_CLIENT_TWICE', ONE_CLIENT_TWICE],
    ] as const
  ).map(([name, value]) => ({
    module: 'src/gen5/battle-mons.fixtures.ts',
    name,
    value,
    path: ['battle', 'single'],
  })),
  { module: 'src/gen5/hp-numbers.fixtures.ts', name: 'GAUGE', value: GAUGE, path: ['gauge'] },
  {
    module: 'src/gen5/hp-numbers.fixtures.ts',
    name: 'ODD_GAUGE',
    value: ODD_GAUGE,
    path: ['gauge'],
  },
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
  {
    module: 'scripts/gen5-bw2-textbox.fixtures.ts',
    name: 'TEXT_BOX_INPUT',
    value: textBoxNumbers(TEXT_BOX_INPUT),
    path: ['textBox'],
  },
  {
    module: 'scripts/gen5-bw2-textbox.fixtures.ts',
    name: 'TEXT_BOX_NUMBERS',
    value: TEXT_BOX_NUMBERS,
    path: ['textBox'],
  },
  ...(
    [
      ['REPORT_NUMBERS', REPORT_NUMBERS],
      ['REPORT_OUTSIDE', REPORT_OUTSIDE],
    ] as const
  ).map(([name, value]) => ({
    module: 'scripts/gen5-bw2-report.fixtures.ts',
    name,
    value,
    path: [],
  })),
  {
    module: 'scripts/gen5-bw2-gauge.fixtures.ts',
    name: 'GAUGE_INPUT',
    value: gaugeNumbers(GAUGE_INPUT),
    path: ['gauge'],
  },
  {
    module: 'scripts/gen5-bw2-gauge.fixtures.ts',
    name: 'ODD_READ_GAUGE',
    value: ODD_READ_GAUGE,
    path: ['gauge'],
  },
  {
    module: 'scripts/gen5-bw2-flow.fixtures.ts',
    name: 'FLOW_INPUT',
    value: flowNumbers(FLOW_INPUT),
    path: ['flow'],
  },
  {
    module: 'scripts/gen5-bw2-effects.fixtures.ts',
    name: 'EFFECTS_INPUT',
    value: effectNumbers(EFFECTS_INPUT, EFFECTS_CONSTANTS),
    path: ['effects'],
  },
  {
    module: 'scripts/gen5-bw2-effects.fixtures.ts',
    name: 'EFFECTS_CONSTANTS',
    value: EFFECTS_CONSTANTS,
    path: ['battle', 'constants'],
  },
  {
    module: 'scripts/gen5-bw2-effects.fixtures.ts',
    name: 'EFFECTS_ITEMS',
    value: EFFECTS_ITEMS,
    path: ['pkm', 'items'],
  },
  ...(['queueSize', 'adapter'] as const).map((key) => ({
    module: 'scripts/gen5-moment-room.fixtures.ts',
    name: `ROOMY_NUMBERS.${key}`,
    value: ROOMY_NUMBERS[key],
    path: [key],
  })),
  ...(
    [
      'text',
      'flow',
      'effects',
      'serverCommands',
      'messages',
      'queueSize',
      'battle',
      'textBox',
      'gauge',
    ] as const
  ).map((key) => ({
    module: 'src/gen5/backend/replay.fixtures.ts',
    name: `REPLAY_NUMBERS.${key}`,
    value: REPLAY_NUMBERS[key],
    path: [key],
  })),
]

/** The fixture modules that hold no number of pokebw2: the archives' fixtures. `ROUTINE` beside
 * `ENTRY` stays out of the compare too: it is the build of our own routine, not pokebw2's. */
const NOT_POKEBW2 = ['src/gen5/lzma.fixtures.ts', 'src/gen5/seven-zip.fixtures.ts']

// Scene: CI must never pass with the spec on the real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
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
      expect(namesAt(value, real(), path, name)).toEqual([])
    })
  }
})
