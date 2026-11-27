// The Pokémon encoder (#97) on pokebw2's real format and the tracked save: build/gen5/bw2.json,
// which scripts/gen5-bw2.ts generates from the pinned checkout, and src/web/gen5/saves/route-20.sav
// (docs/gen5-save.md). CI fetches the pin and generates the file before the check, so there a
// missing file fails the guard; on a machine without it the spec skips. CI's log is public, so
// every assertion compares names, booleans or the two strings docs/gen5-save.md gives: a failure
// shows no number of pokebw2 and no byte of the save.
import { existsSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../src/script/build.ts'
import { readReplay } from '../src/script/replay.ts'
import { sealParties } from '../src/gen5/backend/party-mon.ts'
import { buildGen5Replay } from '../src/gen5/backend/replay.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { openPkm, pkmConstant, pkmField, pkmLayout, sealPkm } from '../src/gen5/pkm-cipher.ts'
import { plainPkm, type ReadPkm, readPkm } from '../src/gen5/pkm-fields.ts'
import { pkmFormat } from '../src/gen5/pkm-members.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { firstSavePkm, partiesIn } from './gen5-save-party.ts'

const FILE = GEN5_PATHS.bw2Json
const SAVE = `${GEN5_PATHS.saves}/route-20.sav`
/** The two Gen 5 OU test replays (#106). */
const GEN5_REPLAYS = ['gen5ou-2718717830', 'smogtours-gen5ou-862240']

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

    // Scene: the save's one PID reaches one row of the table; the encoder writes under any row.
    it('seals and opens the first Pokémon back under a PID of every row of the table', () => {
      const { pkm } = real()
      const { plain } = openPkm(firstPkm(real()), pkm)
      const at = pkmField(pkm, 'PartyPkm', 'base.pid').offset
      const pid = new DataView(plain.buffer, plain.byteOffset).getUint32(at, true)
      const { mask, shift } = pkm.selector
      const back = pkm.blockOffsets.map((_, row) => {
        const moved = Uint8Array.from(plain)
        const under = ((pid & ~mask) | (row << shift)) >>> 0
        new DataView(moved.buffer).setUint32(at, under, true)
        const opened = openPkm(sealPkm(moved, pkm), pkm)
        const picked = (under & mask) >>> shift === row
        return picked && opened.checksumRight && sameBytes(opened.plain, moved)
      })
      expect(back.length > 1, 'a table of more than one row').toBe(true)
      expect(back.every(Boolean), 'every row gives the plain bytes back').toBe(true)
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

    // Scene: the run writes both Gen 5 OU test replays' parties into the battle (#106).
    it("seals both Gen 5 OU test replays' parties, each opening with a right checksum", () => {
      const numbers = real()
      const format = pkmFormat(numbers)
      const results = GEN5_REPLAYS.flatMap((id) => {
        const file = new URL(`../test/fixtures/replays/${id}.json`, import.meta.url)
        const json: unknown = JSON.parse(readFileSync(file, 'utf8'))
        const replay = buildGen5Replay(buildBattleScript(readReplay(json).log), numbers)
        const { parties } = sealParties(replay.parties, format)
        return (['player', 'opponent'] as const).flatMap((side) =>
          parties[side].map((bytes, i) => {
            const opened = openPkm(bytes, numbers.pkm)
            const read = readPkm(opened.plain, format)
            const mon = replay.parties[side][i]
            const same = (key: 'species' | 'item' | 'ability' | 'hp' | 'maxHp') =>
              read[key] === mon?.[key]
            return (
              opened.checksumRight &&
              same('species') &&
              same('item') &&
              same('ability') &&
              same('hp') &&
              same('maxHp')
            )
          }),
        )
      })
      expect(results.length === 24, 'twelve Pokémon in each replay').toBe(true)
      expect(results.every(Boolean), 'each opens with a right checksum, as written').toBe(true)
    })
  },
)
