// The direct entry's one plan (#97) on the build machine's real files: build/gen5/bw2.json,
// which scripts/gen5-bw2.ts generates from pokebw2 at its pin, and build/gen5/routine.json, which
// scripts/gen5-routine.ts builds with the ARM compiler. CI has no ARM compiler (D7), so there the
// spec skips; scripts/gen5-bw2-real.test.ts holds the guard on the generated file. As there, every
// assertion compares names or booleans, and a failure shows no number of pokebw2.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { battleRefs } from '../src/gen5/battle-check.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { takeover } from '../src/gen5/direct-takeover.ts'
import type { MacroStep } from '../src/gen5/macro.ts'
import type { RoutineBuild } from '../src/gen5/routine-order.ts'
import { ROUTINE_PIECES } from '../src/gen5/routine-layout.ts'
import { readMomentOptions } from './gen5-moment-args.ts'
import { sessionPlan } from './gen5-moment-direct.ts'
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

describe.skipIf(!FILES.every((file) => existsSync(file)))(
  'the direct entry on the real files',
  () => {
    const options = readMomentOptions(['--entry', 'direct', '--save', 'route-20'], 0)
    const input = () => ({
      refs: battleRefs(real().numbers),
      trainer: real().numbers.saveTrainer,
      entry: real().numbers.entry,
      readRoutine: () => real().routine,
      readState: () => {
        throw new Error('no state')
      },
    })

    it('build one plan: the takeover right after its window, park, then go before gone', () => {
      const { plan, notes } = sessionPlan(options, input())
      const steps = named(plan.steps)
      expect(steps.slice(0, 2)).toEqual(['until takeover-window', 'write takeover'])
      const park = steps.indexOf('mark park')
      expect(steps.slice(park, park + 6)).toEqual([
        'mark park',
        'until park-check',
        'write park',
        'until go-region',
        'write go',
        'until gone',
      ])
      expect(steps.at(-1)).toBe('mark battle')
      expect(notes, 'the default names fit').toEqual([])
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
