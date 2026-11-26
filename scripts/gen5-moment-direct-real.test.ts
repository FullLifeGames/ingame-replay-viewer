// The direct entry's one plan (#97) on the build machine's real files: build/gen5/bw2.json,
// which scripts/gen5-bw2.ts generates from pokebw2 at its pin, and build/gen5/routine.json, which
// scripts/gen5-routine.ts builds with the ARM compiler. CI has no ARM compiler (D7), so there the
// spec skips; scripts/gen5-bw2-real.test.ts holds the guard on the generated file. As there, every
// assertion compares names or booleans, and a failure shows no number of pokebw2: the team's cut
// notes hold a room, so no assertion prints them.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { battleRefs } from '../src/gen5/battle-check.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { takeover } from '../src/gen5/direct-takeover.ts'
import type { MacroStep } from '../src/gen5/macro.ts'
import { openPkm } from '../src/gen5/pkm-cipher.ts'
import { readPkm } from '../src/gen5/pkm-fields.ts'
import { pkmFormat } from '../src/gen5/pkm-members.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { ROUTINE_PIECES } from '../src/gen5/routine-layout.ts'
import { readMomentOptions } from './gen5-moment-args.ts'
import { sessionPlan } from './gen5-moment-direct.ts'
import { dexSpecies, TEAM, type TeamMon, teamParties, unresolved } from './gen5-moment-team.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILES = [GEN5_PATHS.bw2Json, GEN5_PATHS.routineJson]
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

/** The real files, read once a test runs: a skipped suite still collects its body. */
let cached: { numbers: Bw2Numbers; routine: RoutineBuild } | undefined
const real = () =>
  (cached ??= {
    numbers: readJson(GEN5_PATHS.bw2Json) as Bw2Numbers,
    routine: readJson(GEN5_PATHS.routineJson) as RoutineBuild,
  })

const named = (steps: readonly MacroStep[]) =>
  steps.map((step) => ('name' in step ? `${step.kind} ${step.name}` : step.kind))

const SIDES = ['player', 'opponent'] as const
const plain = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The team's Pokémon by side and slot, with what `bad` finds wrong in each. */
const slotsWhere = (bad: (mon: TeamMon, side: (typeof SIDES)[number], i: number) => boolean) =>
  SIDES.flatMap((side) =>
    TEAM[side].flatMap((mon, i) => (bad(mon, side, i) ? [`${side} ${String(i)}`] : [])),
  )

/** Whether @pkmn gives the species of `number` the gender written. */
function genderFits(mon: TeamMon, number: number | undefined): boolean {
  const gender = number === undefined ? undefined : dexSpecies(number)?.gender
  if (gender === 'N') return mon.gender === 'none'
  if (gender === 'M' || gender === 'F') return mon.gender === (gender === 'M' ? 'male' : 'female')
  return mon.gender !== 'none'
}

describe.skipIf(!FILES.every((file) => existsSync(file)))(
  'the direct entry on the real files',
  () => {
    const options = readMomentOptions(['--entry', 'direct'], 0)
    const team = () => teamParties(pkmFormat(real().numbers), options.names)
    const input = () => ({
      refs: battleRefs(real().numbers),
      trainer: real().numbers.saveTrainer,
      entry: real().numbers.entry,
      readRoutine: () => real().routine,
      readState: () => {
        throw new Error('no state')
      },
      parties: team().parties,
    })

    it('build one plan: the takeover right after its window, park, then go before gone', () => {
      const { plan, notes } = sessionPlan(options, input())
      const steps = named(plan.steps)
      expect(steps.slice(0, 2)).toEqual(['until takeover-window', 'write takeover'])
      const park = steps.indexOf('mark park')
      expect(steps.slice(park, park + 7)).toEqual([
        'mark park',
        'until park-check',
        'write park',
        'until park-written',
        'until go-region',
        'write go',
        'until gone',
      ])
      expect(steps.at(-1)).toBe('mark battle')
      expect(notes, 'the default names fit').toEqual([])
    })

    it('resolve every name of the team, each species with a gender and ability @pkmn gives it', () => {
      const { pkm } = real().numbers
      expect(unresolved(pkm), 'names the lists lack').toEqual([])
      const species = (mon: TeamMon) => pkm.species[mon.species]
      expect(slotsWhere((mon) => !genderFits(mon, species(mon)))).toEqual([])
      const abilityMissed = (mon: TeamMon) => {
        const dex = dexSpecies(species(mon) ?? -1)
        const own = Object.values(dex?.abilities ?? {}).map(plain)
        return !own.includes(plain(mon.ability.replace(/^ABILITY_/, '')))
      }
      expect(slotsWhere(abilityMissed)).toEqual([])
    })

    it('seal every Pokémon to open with a right checksum, as written, and no shiny', () => {
      const { numbers } = real()
      const { parties, written } = team()
      const opened = (side: (typeof SIDES)[number], i: number) =>
        openPkm(parties[side][i] ?? new Uint8Array(), numbers.pkm)
      expect(slotsWhere((_, side, i) => !opened(side, i).checksumRight)).toEqual([])
      const read = (side: (typeof SIDES)[number], i: number) =>
        readPkm(opened(side, i).plain, pkmFormat(numbers))
      expect(slotsWhere((_, side, i) => read(side, i).shiny)).toEqual([])
      const asWritten = (side: (typeof SIDES)[number], i: number) => {
        const [one, back] = [written[side][i], read(side, i)]
        return one?.species === back.species && one.item === back.item && one.hp === back.hp
      }
      expect(slotsWhere((_, side, i) => !asWritten(side, i))).toEqual([])
      expect(
        team().notes.some((note) => note.startsWith('player.party.pkms[0] PkmBlockC.nickname')),
      ).toBe(true)
    })

    it('write both parties whole at the park, before the go', () => {
      const { plan } = sessionPlan(options, input())
      const steps = named(plan.steps)
      expect(steps.indexOf('write park') < steps.indexOf('write go'), 'park before go').toBe(true)
      const step = plan.steps.find((one) => one.kind === 'write' && one.name === 'park')
      const writes = step?.kind === 'write' ? step.writes : []
      const party = writes.filter((write) => write.field.includes('.party.'))
      const expected = SIDES.flatMap((side) => [
        ...TEAM[side].map((_, i) => `${side}.party.pkms[${String(i)}]`),
        `${side}.party.count`,
        `${side}.party.slotExists`,
      ])
      expect(party.map((write) => write.field)).toEqual(expected)
      const sealed = SIDES.flatMap((side) => team().parties[side])
      const bytes = party.flatMap((write) =>
        write.kind === 'bytes' && write.field.includes('pkms[') ? [write.bytes] : [],
      )
      const same = bytes.every((one, i) => one.every((byte, at) => byte === sealed[i]?.[at]))
      expect(
        same && bytes.length === sealed.length,
        'the sealed bytes as the team gives them',
      ).toBe(true)
    })

    it('read the double style back before the go', () => {
      const { numbers } = real()
      const double = readMomentOptions(['--entry', 'direct', '--battle', 'double'], 0)
      const { plan } = sessionPlan(double, input())
      const written = plan.steps.find((one) => one.kind === 'until' && one.name === 'park-written')
      const style =
        written?.kind === 'until' ? written.checks.find((c) => c.name === 'battleStyle') : undefined
      const wanted = numbers.entry.constants.BTL_STYLE_DOUBLE
      expect(style?.oneOf?.length === 1 && style.oneOf[0] === wanted, 'BTL_STYLE_DOUBLE').toBe(true)
    })

    it("lay the routine apart from every value the battle's checks read", () => {
      const { numbers, routine } = real()
      const refs = battleRefs(numbers)
      const { layout } = takeover(numbers.entry, routine)
      const inside = (address: number) =>
        ROUTINE_PIECES.some(
          (piece) => address >= layout[piece].start && address < layout[piece].end,
        )
      const touched = [...refs.checks, ...refs.watch].filter((ref) => inside(ref.address))
      expect(touched.map((ref) => ref.name)).toEqual([])
    })

    it('check every word of the code at the takeover, at the park and before the go', () => {
      const { numbers, routine } = real()
      const { steps } = takeover(numbers.entry, routine)
      const region = (name: string) => {
        const step = steps.find((one) => one.kind === 'until' && one.name === name)
        return step?.kind === 'until'
          ? step.checks.filter((c) => c.name.startsWith('routine code'))
          : []
      }
      const words = Math.ceil(routine.size / 4)
      expect(region('takeover-region').length >= words, 'at the takeover').toBe(true)
      expect(region('park-region').length >= words, 'at the park').toBe(true)
      const { plan } = sessionPlan(options, input())
      const go = plan.steps.find((one) => one.kind === 'until' && one.name === 'go-region')
      const before = go?.kind === 'until' ? go.checks : []
      expect(before.filter((c) => c.name.startsWith('routine code')).length >= words).toBe(true)
    })
  },
)
