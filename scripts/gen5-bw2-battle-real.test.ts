// The battle's constants and rules that the Gen 5 backend names (#106) on pokebw2's real numbers:
// build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout. CI fetches the
// pin and generates the file before the check, so there a missing file fails the guard; on a
// machine without it the relations skip. CI's log is public, so every assertion compares names or
// booleans: a failure names the role and shows no number of pokebw2.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { CONSTANT_PREFIXES } from './gen5-bw2-battle.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// Scene: CI must never pass with the spec on real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

let cached: Bw2Numbers | undefined
const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

/** The weathers, the major conditions with confusion, and the stat stages with HP that the
 * backend's lines write, by pokebw2's names. */
const NEEDED = {
  weathers: ['NONE', 'SUN', 'RAIN', 'HAIL', 'SANDSTORM'].map((name) => `BTL_WEATHER_${name}`),
  conditions: ['NONE', 'PARALYSIS', 'SLEEP', 'FREEZE', 'BURN', 'POISON', 'CONFUSION'].map(
    (name) => `CONDITION_${name}`,
  ),
  stats: [
    ...['ATTACK', 'DEFENSE', 'SP_ATTACK', 'SP_DEFENSE', 'SPEED', 'ACCURACY', 'EVASION'].map(
      (name) => `BATTLEMON_${name}_STAGE`,
    ),
    'BATTLEMON_HP',
    'BATTLEMON_MAX_HP',
  ],
}

describe.skipIf(!existsSync(FILE))(
  "the battle's constants and rules on the generated numbers",
  () => {
    // Scene: a turn of the replay names the weather, the condition or the stat stage it shows.
    it('name every weather, condition and stat the backend needs, each group with values of its own', () => {
      const { constants } = real().battle
      const groups = Object.values(NEEDED)
      expect(groups.flat().filter((name) => constants[name] === undefined)).toEqual([])
      const shared = Object.entries(NEEDED).filter(
        ([, names]) => new Set(names.map((name) => constants[name])).size !== names.length,
      )
      expect(shared.map(([group]) => group)).toEqual([])
    })

    it("hold only the three prefixes, so no side's or field's condition", () => {
      const { constants } = real().battle
      const other = (name: string) => !CONSTANT_PREFIXES.some((prefix) => name.startsWith(prefix))
      expect(Object.keys(constants).filter(other)).toEqual([])
    })
  },
)
