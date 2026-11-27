// The maps from Showdown's names (src/gen5/backend/names.ts) on pokebw2's real lists:
// build/gen5/bw2.json, which scripts/gen5-bw2.ts generates from the pinned checkout. CI fetches the
// pin and generates the file before the check, so there a missing file fails the guard; on a
// machine without it the spec skips. CI's log is public, so every assertion compares names and
// truth values: a failure prints Showdown's names and pokebw2's constant names, never a number.
import { existsSync, readFileSync } from 'node:fs'

import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import {
  ACCEPTED_RENAMES,
  constantMatches,
  gameName,
  gen5Ability,
  gen5Item,
  gen5Move,
  gen5Nature,
  gen5Species,
  type NameKind,
} from '../src/gen5/backend/names.ts'
import type { PkmNumbers } from '../src/gen5/bw2-numbers.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// Scene: CI must never pass with the spec on the real lists skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

let cached: PkmNumbers | undefined
const real = (): PkmNumbers =>
  (cached ??= (JSON.parse(readFileSync(FILE, 'utf8')) as { pkm: PkmNumbers }).pkm)

type GenerationsDex = ConstructorParameters<typeof Generations>[0]
const gen5 = new Generations(Dex as GenerationsDex).get(5)

/** Each kind's Gen 5 entries in @pkmn by name, and its map. */
const KINDS: Record<NameKind, { names: () => string[]; map: (name: string) => number }> = {
  species: {
    names: () => [...gen5.species].filter((one) => !one.forme).map((one) => one.name),
    map: (name) => gen5Species(name).num,
  },
  move: { names: () => [...gen5.moves].map((one) => one.name), map: gen5Move },
  item: { names: () => [...gen5.items].map((one) => one.name), map: gen5Item },
  ability: { names: () => [...gen5.abilities].map((one) => one.name), map: gen5Ability },
}
const LISTS = { species: 'species', move: 'moves', item: 'items', ability: 'abilities' } as const

/** The constants of a kind's list at the number a Showdown name maps to. */
function constantsOf(kind: NameKind, name: string): string[] {
  const num = KINDS[kind].map(name)
  const list = real()[LISTS[kind]]
  return Object.keys(list).filter((constant) => list[constant] === num)
}

/** Whether some constant at a name's number matches it, plainly or under the game's own name. */
const matched = (kind: NameKind, name: string, game = gameName(kind, name)) =>
  constantsOf(kind, name).some((constant) => constantMatches(constant, game))

const plainly = (kind: NameKind, name: string) => matched(kind, name, name)

/** A name that fails, beside the constants at its number. */
const shown = (kind: NameKind, name: string) => `${name}: ${constantsOf(kind, name).join('/')}`

/** The moves whose game name comes from the Hidden Power rule rather than the renames. */
const typedHiddenPowers = () => {
  const renamed = new Set(ACCEPTED_RENAMES.move.map(([showdown]) => showdown))
  return KINDS.move.names().filter((name) => gameName('move', name) !== name && !renamed.has(name))
}

/** Whether a nature misses its constant in the generated list. */
function natureFails(natures: PkmNumbers['natures'], name: string): boolean {
  try {
    gen5Nature(natures, name)
    return false
  } catch {
    return true
  }
}

describe.skipIf(!existsSync(FILE))("the maps on pokebw2's lists", () => {
  it.each(Object.keys(KINDS) as NameKind[])(
    'give every Gen 5 %s of @pkmn a constant of its name',
    (kind) => {
      const names = KINDS[kind].names()
      expect(names.length > 0, `@pkmn has Gen 5 entries of the kind ${kind}`).toBe(true)
      const failing = names.filter((name) => !matched(kind, name)).map((name) => shown(kind, name))
      expect(failing).toEqual([])
    },
  )

  // Scene: pokebw2 or @pkmn renames an entry back, and the rename stays behind unneeded.
  it.each(['move', 'item'] as const)('still need every accepted %s rename', (kind) => {
    const stale = ACCEPTED_RENAMES[kind]
      .filter(([showdown]) => plainly(kind, showdown))
      .map(([showdown]) => shown(kind, showdown))
    expect(stale).toEqual([])
  })

  it('still need the rule for the typed Hidden Powers', () => {
    const typed = typedHiddenPowers()
    expect(typed.length > 0, '@pkmn has typed Hidden Powers in Gen 5').toBe(true)
    const stale = typed.filter((name) => plainly('move', name)).map((name) => shown('move', name))
    expect(stale).toEqual([])
  })

  it('give every Gen 5 nature of @pkmn its constant by name', () => {
    const { natures } = real()
    const names = [...gen5.natures].map((one) => one.name)
    const failing = names.filter((name) => natureFails(natures, name))
    expect(failing).toEqual([])
    expect(Object.keys(natures).length === names.length, 'one constant per nature').toBe(true)
  })
})
