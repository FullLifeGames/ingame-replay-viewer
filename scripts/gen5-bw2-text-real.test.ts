// The lines and the flow's numbers that the Gen 5 backend sends (#107 to #110) on pokebw2's
// real numbers: build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout.
// CI fetches the pin and generates the file before the check, so there a missing file fails the
// guard; on a machine without it the relations skip. CI's log is public, so every assertion
// compares names or booleans: a failure names the label or the role and shows no number of
// pokebw2.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { readSources } from './gen5-bw2.ts'
import { checkLineSources, LINE_TABLES } from './gen5-bw2-lines.ts'
import { listedReader } from './gen5-bw2-source.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// Scene: CI must never pass with the spec on real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

let cached: Bw2Numbers | undefined
const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

describe.skipIf(!existsSync(FILE))("the backend's lines and the flow's numbers", () => {
  // Scene: a hit, a miss, a failure, a heal or an effect sends its line by the label's index in
  // its bank (#107, #109).
  it.each(Object.entries(LINE_TABLES))('find every label of the %s in its bank', (_, table) => {
    const { text } = real()
    const missing = Object.values(table).filter(
      (line) => !Object.hasOwn(text[line.bank], line.label),
    )
    expect(missing.map((line) => line.label)).toEqual([])
  })

  // Scene: the generator held each label to its function; the file must still match the pin. The
  // check's error names the label and the function alone.
  it.each(Object.entries(LINE_TABLES))('hold each of the %s to its C at the pin', (_, table) => {
    const sources = readSources(listedReader(GEN5_PATHS.pokebw2))
    expect(() => {
      checkLineSources(sources, real().text, table)
    }).not.toThrow()
  })

  // Scene: the hit flash's kind picks the hit sound, so the three must differ.
  it('give the three damage kinds values of their own', () => {
    const kinds = Object.values(real().flow.damageKinds)
    expect(
      kinds.every((kind) => Number.isInteger(kind)),
      'each kind an integer',
    ).toBe(true)
    expect(new Set(kinds).size === 3, 'three distinct kinds').toBe(true)
  })

  // Scene: a heal by Leftovers shows the heal effect at the Pokémon's position.
  it('give the heal effect as an integer', () => {
    expect(Number.isInteger(real().flow.recoverEffect), 'the heal effect an integer').toBe(true)
  })

  // Scene: a switch and a drag each recall the Pokémon with the effect the server passes on, and
  // a drag hides it at once, so the two must differ (#108).
  it('give the two recall effects as integers of their own', () => {
    const { switchOut, drag } = real().flow.switchEffects
    expect(
      [switchOut, drag].every((effect) => Number.isInteger(effect)),
      'each effect an integer',
    ).toBe(true)
    expect(switchOut !== drag, 'the two effects differ').toBe(true)
  })

  // Scene: a Pokémon that faints with HP left has its bar emptied with the server's flag.
  it("give the faint's flag as an integer", () => {
    expect(Number.isInteger(real().flow.faintGaugeFlag), "the faint's flag an integer").toBe(true)
  })

  // Scene: Solar Beam in sun fires in the turn it charges, with the release's look (#110).
  it("give the charge's release index as an integer", () => {
    expect(Number.isInteger(real().flow.chargeRelease), 'the release index an integer').toBe(true)
  })
})
