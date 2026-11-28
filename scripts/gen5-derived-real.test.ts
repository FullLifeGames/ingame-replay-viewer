// The derivations' check (#138, scripts/gen5-derived.ts): each derivation of the table runs on its
// fixture and on build/gen5/bw2.json, and no number under a role key may come out equal. The scenes
// run invented derivations on every machine; the table skips without the generated file and fails
// under CI without it. CI's log is public, so a failure names the derivation, the check and the
// path, never a value.
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { derivedNames, type OursDerived } from './gen5-derived.ts'
import { OURS_DERIVED } from './gen5-derived-ours.ts'
import { DERIVED } from './gen5-derived-table.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json

// Scene: CI must never pass with the table on the real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

/** An invented derivation: a check through a member's slot, `offset + index * 4`, under a mask
 * of `bits` bits from `bit`. */
const slotCheck = (numbers: { offset: number; index: number; bit: number; bits: number }) => ({
  name: 'party',
  address: 0x02000100,
  hops: [numbers.offset + numbers.index * 4, 0],
  width: 4,
  mask: (2 ** numbers.bits - 1) * 2 ** numbers.bit,
  oneOf: [1],
  bytes: [numbers.index],
})

const OURS = { offset: 0x20, index: 1, bit: 2, bits: 3 }
const REAL = { offset: 0x1c, index: 2, bit: 3, bits: 2 }

describe('the derivations on invented numbers', () => {
  // Scene: W7-7, a slot derived from two fixture numbers that each differ lands on the real slot.
  it('names a derived hop equal to the real derivation while both inputs differ', () => {
    const outputs = { ours: [slotCheck(OURS)], real: [slotCheck(REAL)] }
    expect(derivedNames('slot', outputs, [])).toEqual([
      'slot <party>.0.address',
      'slot <party>.0.hops.0',
      'slot <party>.0.oneOf.0',
    ])
  })

  it('names a derived mask by its check and path', () => {
    const outputs = {
      ours: { gauge: slotCheck(OURS) },
      real: { gauge: slotCheck({ ...REAL, bit: 2, bits: 3 }) },
    }
    expect(derivedNames('mask', outputs, [])).toContain('mask <party>.gauge.mask')
  })

  it('skips the role keys of our own, and a value named in the list of our own', () => {
    const ours: OursDerived[] = [
      { derivations: ['slot'], check: /^party$/, key: 'address', reason: 'an invented address' },
      { derivations: ['slot'], check: /^party$/, key: 'oneOf', reason: 'an invented value' },
    ]
    const outputs = { ours: [slotCheck(OURS)], real: [slotCheck(REAL)] }
    expect(derivedNames('slot', outputs, ours)).toEqual(['slot <party>.0.hops.0'])
    expect(derivedNames('other', outputs, ours)).toHaveLength(3)
  })

  // Scene: every struct starts at 0, so a hop into a first member names nothing.
  it('skips a 0 under a hop, and counts no number outside a role key', () => {
    const outputs = { ours: { count: 4, hops: [0, 8] }, real: { count: 4, hops: [0, 9] } }
    expect(derivedNames('zero', outputs, [])).toEqual([])
  })

  it('counts the keys of offsets a row adds, but a 0 where a buffer starts', () => {
    const outputs = { ours: { A: 8, B: 40, C: 0 }, real: { A: 8, B: 72, C: 0 } }
    expect(derivedNames('places', outputs, [], ['A', 'B', 'C'])).toEqual(['places <>.A'])
  })
})

describe.skipIf(!existsSync(FILE))('the derivations of the fixtures on the real numbers', () => {
  let cached: Bw2Numbers | undefined
  const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

  for (const { name, ours, real: derive, keys } of DERIVED) {
    // Scene: a hop worked by hand from two fixture numbers holds the real one; the row names it.
    it(`${name}: no derived number equals the generated derivation`, () => {
      const outputs = { ours: ours(), real: derive(real()) }
      expect(derivedNames(name, outputs, OURS_DERIVED, keys)).toEqual([])
    })
  }
})
