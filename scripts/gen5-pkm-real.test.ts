// The Pokémon encoder (#97) on pokebw2's real format and the tracked save: build/gen5/bw2.json,
// which scripts/gen5-bw2.ts generates from the pinned checkout, and src/web/gen5/saves/route-20.sav
// (docs/gen5-save.md). CI fetches the pin and generates the file before the check, so there a
// missing file fails the guard; on a machine without it the spec skips. CI's log is public, so
// every assertion compares names, booleans or the two strings docs/gen5-save.md gives: a failure
// shows no number of pokebw2 and no byte of the save.
import { existsSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { openPkm, pkmConstant, pkmLayout, sealPkm } from '../src/gen5/pkm-cipher.ts'
import { plainPkm, type ReadPkm, readPkm } from '../src/gen5/pkm-fields.ts'
import { pkmFormat } from '../src/gen5/pkm-members.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { firstSavePkm, partiesIn } from './gen5-save-party.ts'

const FILE = GEN5_PATHS.bw2Json
const SAVE = `${GEN5_PATHS.saves}/route-20.sav`

// Scene: CI must never pass with the spec on the real format skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

let cached: Bw2Numbers | undefined
const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)
const save = (): Uint8Array => new Uint8Array(readFileSync(SAVE))

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i])

/** The constant name a list gives a number, if any. */
const nameOf = (list: Record<string, number>, value: number) =>
  Object.entries(list).find(([, number]) => number === value)?.[0]

/** The save's first party Pokémon, sealed as the save holds it. */
const firstPkm = (numbers: Bw2Numbers): Uint8Array => firstSavePkm(save(), numbers.pkm)

/** The fields whose values differ between two readings, by name. */
const differing = (a: ReadPkm, b: ReadPkm) =>
  (Object.keys(a) as (keyof ReadPkm)[]).filter((key) => !isDeepStrictEqual(a[key], b[key]))

describe.skipIf(!existsSync(FILE))(
  "the Pokémon encoder on the real format and the save's Tepig",
  () => {
    it('finds the party in the save, each copy alike', () => {
      const { pkm } = real()
      const bytes = save()
      const found = partiesIn(bytes, pkm)
      const size = pkmLayout(pkm, 'PokeParty').size
      const copy = (at: number) => bytes.subarray(at, at + size)
      const [one = -1] = found
      expect(found.length > 0, 'a party in the save').toBe(true)
      expect(
        found.every((at) => sameBytes(copy(at), copy(one))),
        'every copy alike',
      ).toBe(true)
    })

    it('opens the first Pokémon with a right checksum and seals it again byte for byte', () => {
      const { pkm } = real()
      const sealed = firstPkm(real())
      const opened = openPkm(sealed, pkm)
      expect(opened.checksumRight, 'the checksum is right').toBe(true)
      expect(
        sameBytes(sealPkm(opened.plain, pkm), sealed),
        'sealed again as the save holds it',
      ).toBe(true)
    })

    it('reads its fields by name', () => {
      const numbers = real()
      const { pkm } = numbers
      const read = readPkm(openPkm(firstPkm(numbers), pkm).plain, pkmFormat(numbers))
      expect(nameOf(pkm.species, read.species)).toBe('SPECIES_TEPIG')
      expect(nameOf(pkm.moves, read.moves[0]?.move ?? -1)).toBe('MOVE_TACKLE')
      expect(nameOf(pkm.items, read.ball)).toBe('ITEM_POKE_BALL')
      expect(read.language === pkmConstant(pkm, 'LANGUAGE_ENGLISH'), 'LANGUAGE_ENGLISH').toBe(true)
      expect(read.origin === pkmConstant(pkm, 'VERSION_BLACK2'), 'VERSION_BLACK2').toBe(true)
      expect([read.name, read.nicknamed, read.ot.name, read.gender]).toEqual([
        'Tepig',
        false,
        'IRV',
        'male',
      ])
      expect(read.hp <= read.maxHp, 'HP at most max HP').toBe(true)
    })

    it('writes the fields read onto the opened bytes and gets the same bytes', () => {
      const numbers = real()
      const format = pkmFormat(numbers)
      const plain = openPkm(firstPkm(numbers), numbers.pkm).plain
      const written = plainPkm(readPkm(plain, format), format, plain)
      expect(written.cuts.length === 0, 'no name cut').toBe(true)
      expect(sameBytes(written.bytes, plain), 'the same plain bytes').toBe(true)
    })

    it('writes a Pokémon from those fields onto empty bytes and reads them back', () => {
      const numbers = real()
      const format = pkmFormat(numbers)
      const read = readPkm(openPkm(firstPkm(numbers), numbers.pkm).plain, format)
      const fresh = plainPkm(read, format).bytes
      expect(differing(readPkm(fresh, format), read)).toEqual([])
      const opened = openPkm(sealPkm(fresh, numbers.pkm), numbers.pkm)
      expect(opened.checksumRight, 'the checksum of the sealed copy is right').toBe(true)
      expect(differing(readPkm(opened.plain, format), read)).toEqual([])
    })
  },
)
