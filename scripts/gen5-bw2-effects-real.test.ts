// The effects' names and numbers (#109) on pokebw2's real numbers: build/gen5/bw2.json, which
// scripts/gen5-bw2.ts generates from the pinned checkout. CI fetches the pin and generates the
// file before the check, so there a missing file fails the guard; on a machine without it the
// relations skip. CI's log is public, so every assertion compares names or booleans: a failure
// names the role and shows no number of pokebw2.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import {
  GEN5_EFFECTIVENESS,
  GEN5_STAGE,
  GEN5_STATUS,
  GEN5_WEATHER,
} from '../src/gen5/backend/effect-names.ts'
import { readSources } from './gen5-bw2.ts'
import { checkEffectLiterals } from './gen5-bw2-effects.ts'
import { listedReader } from './gen5-bw2-source.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// Scene: CI must never pass with the spec on real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

let cached: Bw2Numbers | undefined
const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

/** Every name of the four records. */
const NAMES = [
  ...Object.values(GEN5_STATUS).map(({ condition }) => condition),
  ...Object.values(GEN5_WEATHER).filter((name) => name !== undefined),
  ...Object.values(GEN5_STAGE),
  ...Object.values(GEN5_EFFECTIVENESS),
]

/** The paths of every number under `value`, and whether each is an integer. */
const numbersOf = (value: unknown, path: string): [string, boolean][] => {
  if (typeof value === 'number') return [[path, Number.isInteger(value)]]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, inner]) => numbersOf(inner, `${path}.${key}`))
}

describe.skipIf(!existsSync(FILE))("the effects' names and numbers on the generated file", () => {
  // Scene: a status, a weather or a stat change of the log goes out by its constant's number.
  it("find every name of the name maps among the battle's constants", () => {
    const { constants } = real().battle
    expect(NAMES.filter((name) => constants[name] === undefined)).toEqual([])
  })

  // Scene: a weather Black 2 has but no name of @pkmn reaches would never play.
  it('reach every weather Black 2 has from a name of @pkmn', () => {
    const reached = new Set(Object.values(GEN5_WEATHER))
    const weathers = Object.keys(real().battle.constants).filter(
      (name) => name.startsWith('BTL_WEATHER_') && name !== 'BTL_WEATHER_NONE',
    )
    expect(weathers.length > 0, 'Black 2 has weathers').toBe(true)
    expect(weathers.filter((name) => !reached.has(name as `BTL_WEATHER_${string}`))).toEqual([])
  })

  it('give each effect number as an integer, and an effect for every major status', () => {
    const { effects } = real()
    const odd = numbersOf(effects, 'effects').filter(([, integer]) => !integer)
    expect(odd.map(([path]) => path)).toEqual([])
    const conditions = new Set(Object.values(GEN5_STATUS).map(({ condition }) => condition))
    expect([...conditions].filter((name) => effects.addEffects[name] === undefined)).toEqual([])
  })

  // Scene: the client tells a status for good, bad poison and sleep apart by the value alone.
  it('give a status for good, bad poison and sleep values of their own, none of them none', () => {
    const { permanent, badlyPoisoned, sleep } = real().effects.conditionValues
    const values = [permanent, badlyPoisoned, sleep]
    expect(new Set(values).size === values.length, 'three values apart').toBe(true)
    expect(
      values.every((value) => value > 0),
      'none of them zero',
    ).toBe(true)
  })

  // Scene: a lead's Drizzle or Intimidate plays before the first turn in the game.
  it('list Drizzle and Intimidate among the abilities that act on coming in, each a real one', () => {
    const { effects, pkm } = real()
    const names = effects.memberInAbilities
    expect(
      ['ABILITY_DRIZZLE', 'ABILITY_INTIMIDATE'].filter((name) => !names.includes(name)),
    ).toEqual([])
    expect(names.filter((name) => pkm.abilities[name] === undefined)).toEqual([])
  })

  // Scene: Knock Off, a held item's use and Focus Punch send a name's number where their C writes a
  // literal; the generator held each literal to its name, and the pin must still match. The check's
  // error names the function and the role alone.
  it('hold the literals of Knock Off, a held item, the effect at a position and Focus Punch to their names', () => {
    const sources = readSources(listedReader(GEN5_PATHS.pokebw2))
    const { pkm, effects } = real()
    expect(() => {
      checkEffectLiterals(sources, { items: pkm.items, hideWindow: effects.hideWindow })
    }).not.toThrow()
  })
})
