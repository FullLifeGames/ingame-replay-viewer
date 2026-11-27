// The battle's constants and rules that the Gen 5 backend names (#106) on pokebw2's real numbers:
// build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout. CI fetches the
// pin and generates the file before the check, so there a missing file fails the guard; on a
// machine without it the relations skip. CI's log is public, so every assertion compares names or
// booleans: a failure names the role and shows no number of pokebw2.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { readSources } from './gen5-bw2.ts'
import { CONSTANT_PREFIXES } from './gen5-bw2-battle.ts'
import { monIdRule } from './gen5-bw2-mon-ids.ts'
import { listedReader } from './gen5-bw2-source.ts'
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

    it("hold only the four prefixes, so no side's or field's condition", () => {
      const { constants } = real().battle
      const other = (name: string) => !CONSTANT_PREFIXES.some((prefix) => name.startsWith(prefix))
      expect(Object.keys(constants).filter(other)).toEqual([])
    })

    // Scene: a server command names a Pokémon by its mon ID, the client's first plus its slot.
    it("give each client of the battle a first mon ID, and every client's IDs a party, apart", () => {
      const { battle, pkm } = real()
      const { firstByClient, perClient } = battle.monIds
      const sorted = [...firstByClient].sort((a, b) => a - b)
      const apart = sorted.every(
        (first, at) => at === 0 || first >= (sorted[at - 1] ?? 0) + perClient,
      )
      expect(apart, "the clients' ranges apart").toBe(true)
      expect(perClient >= (pkm.constants.PARTY_SIZE ?? Infinity), 'a party in each range').toBe(
        true,
      )
      const each = firstByClient.length >= battle.single.clientCount
      expect(each, "a first mon ID for each of the single battle's clients").toBe(true)
      const atPin = monIdRule(readSources(listedReader(GEN5_PATHS.pokebw2)).mainC)
      expect(JSON.stringify(atPin) === JSON.stringify(battle.monIds), 'the rule at the pin').toBe(
        true,
      )
    })

    // Scene: the replay's battle may end in the player's loss, which must not black out (#110).
    it('give the setup flag one bit, inside the setup flags member', () => {
      const { constants, layouts } = real().entry
      const flag = constants.BTL_SETUP_FLAG_NO_BLACKOUT ?? 0
      const bit = Math.log2(flag)
      expect(Number.isInteger(bit), 'a power of two').toBe(true)
      const flags = layouts.BtlSetup?.fields.flags
      const inside = flags !== undefined && flags.bit === undefined && bit < 8 * flags.size
      expect(inside, 'inside BtlSetup.flags').toBe(true)
    })

    // Scene: a replay's names are mostly ASCII, and each of those characters must not turn to "?".
    it('give the characters of both battle fonts every letter and digit of ASCII', () => {
      const { chars } = real().font
      const ascii = Array.from({ length: 0x80 }, (_, code) => String.fromCharCode(code)).filter(
        (char) => /[A-Za-z0-9]/.test(char),
      )
      expect(ascii.filter((char) => !chars.includes(char))).toEqual([])
    })
  },
)
