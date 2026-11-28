import { describe, expect, it } from 'vitest'

import type { GaugeNumbers } from './bw2-gauge-numbers.ts'
import type { FieldLayout } from './bw2-numbers.ts'
import {
  afterBattleStart,
  GAUGES_LIMIT,
  gaugeChecks,
  hideWrites,
  numbersSteps,
} from './hp-numbers.ts'
import { GAUGE, ODD_GAUGE } from './hp-numbers.fixtures.ts'
import { mark, type MacroStep } from './macro.ts'

// Every address, offset, size and value here is invented (hp-numbers.fixtures.ts). The expected
// hops and masks are worked out by hand from the fixture: BtlvEffect.gauge at 0x14; the near
// entry (position 1 of 0x1c bytes) from entries at 0x0c, its hpNumActor at 0x10, so 0x38; in
// ClActor, overwrite's bits from bit 2 and objMode's from bit 13 of the word at 0x28, so the
// OBJMODE flag (1 << 2) at bit 4 and the PRIORITY flag (1 << 4) at bit 6 of its first byte.

const EFFECT = GAUGE.effect.address
const TO_ACTOR = [0x14, 0x38]
const MASH = { buttons: ['A'], every: 4, hold: 2 } as const

/** GAUGE with ClActor's `name` replaced by `field`, or a constant replaced. */
function withActor(name: string, field: FieldLayout): GaugeNumbers {
  const { ClActor } = GAUGE.layouts
  const fields = { ...ClActor.fields, [name]: field }
  return { ...GAUGE, layouts: { ...GAUGE.layouts, ClActor: { ...ClActor, fields } } }
}

// Scene: the page follows sBtlvEffect → gauge → entries[near] → ClActor; the until waits for
// what ClActor_Reset leaves, and each write touches objMode's bits or the one OBJMODE bit of
// overwrite, nothing else.
describe('the hide of the near HP numbers', () => {
  it('leads the checks and both writes along the chain to the right byte and mask', () => {
    expect(gaugeChecks(GAUGE)).toEqual([
      { name: 'sBtlvEffect', address: EFFECT, width: 4, mainRamPointer: true },
      { name: 'effect.gauge', address: EFFECT, hops: [0x14], width: 4, mainRamPointer: true },
      { name: 'near.hpNumActor', address: EFFECT, hops: TO_ACTOR, width: 4, mainRamPointer: true },
      {
        name: 'actor.unit',
        address: EFFECT,
        hops: [...TO_ACTOR, 0x24],
        width: 4,
        mainRamPointer: true,
      },
      {
        name: 'gauge.loaded',
        address: EFFECT,
        hops: [0x14, 0x60],
        width: 1,
        mask: 0x40,
        oneOf: [0x40],
      },
      {
        name: 'actor.autoAnimSpeed',
        address: EFFECT,
        hops: [...TO_ACTOR, 0x08],
        width: 4,
        oneOf: [0x80],
      },
      {
        name: 'actor.overwrite.priority',
        address: EFFECT,
        hops: [...TO_ACTOR, 0x28],
        width: 1,
        mask: 0x40,
        oneOf: [0x40],
      },
      {
        name: 'actor.objMode',
        address: EFFECT,
        hops: [...TO_ACTOR, 0x29],
        width: 1,
        mask: 0x60,
        oneOf: [0x60],
      },
    ])
    expect(hideWrites(GAUGE)).toEqual([
      {
        kind: 'bits',
        field: 'hpNumActor.objMode',
        address: EFFECT,
        hops: [...TO_ACTOR, 0x29],
        mask: 0x60,
        value: 0x20,
      },
      {
        kind: 'bits',
        field: 'hpNumActor.overwrite',
        address: EFFECT,
        hops: [...TO_ACTOR, 0x28],
        mask: 0x10,
        value: 0x10,
      },
    ])
  })

  it('waits for the gauges with the mash given, then writes the hide, for a single', () => {
    const { steps, line } = numbersSteps(GAUGE, 'single', MASH)
    expect(steps).toEqual([
      {
        kind: 'until',
        name: 'gauges',
        checks: gaugeChecks(GAUGE),
        holdFor: 1,
        limit: GAUGES_LIMIT,
        mash: MASH,
      },
      { kind: 'write', name: 'hide-numbers', writes: hideWrites(GAUGE) },
    ])
    expect(line).toBe('HP numbers: hidden in the near box')
    expect(numbersSteps(GAUGE, 'single', undefined).steps[0]).not.toHaveProperty('mash')
  })

  // Scene: a layout read wrong must fail by name before the page writes a byte.
  it('throws by name on an objMode that crosses a byte, and on a position past the entries', () => {
    const odd = ODD_GAUGE.layouts
    const across = withActor('objMode', odd.ClActor.fields.objMode)
    expect(() => numbersSteps(across, 'single', MASH)).toThrow(
      'hpNumActor.objMode is no bit-field in one byte',
    )
    expect(() => gaugeChecks(across)).toThrow('actor.objMode is no bit-field in one byte')
    const flat = withActor('overwrite', odd.ClActor.fields.overwrite)
    expect(() => hideWrites(flat)).toThrow('hpNumActor.overwrite is no bit-field in one byte')
    const far = { ...GAUGE, constants: { ...GAUGE.constants, ...ODD_GAUGE.constants } }
    expect(() => gaugeChecks(far)).toThrow('the gauge has no entry at BTLV_MCSS_POS_SINGLE_PLAYER')
    const { BtlvGaugeEntry } = GAUGE.layouts
    const bare = {
      ...GAUGE,
      layouts: { ...GAUGE.layouts, BtlvGaugeEntry: { ...BtlvGaugeEntry, ...odd.BtlvGaugeEntry } },
    }
    expect(() => hideWrites(bare)).toThrow('the gauge has no BtlvGaugeEntry.hpNumActor')
  })

  it('gives a double no steps and the line', () => {
    expect(numbersSteps(GAUGE, 'double', MASH)).toEqual({
      steps: [],
      line: "HP numbers: shown; a double's near boxes keep them (#137 hides a single's)",
    })
  })
})

// Scene: the gauges exist only once the battle runs, and the near send-in comes in the opening.
describe('afterBattleStart', () => {
  const start: MacroStep = {
    kind: 'until',
    name: 'battle-start',
    checks: [],
    holdFor: 1,
    limit: 120,
    mash: MASH,
  }
  const plan = [mark('gone'), start, mark('battle-start'), mark('action')]

  it("puts the steps right after mark battle-start, with the until's mash", () => {
    const hidden = afterBattleStart(plan, (mash) => numbersSteps(GAUGE, 'single', mash))
    expect(hidden.line).toBe('HP numbers: hidden in the near box')
    expect(hidden.steps).toEqual([
      ...plan.slice(0, 3),
      ...numbersSteps(GAUGE, 'single', MASH).steps,
      plan[3],
    ])
  })

  it('throws on a plan with no until battle-start before its mark', () => {
    const hide = (mash: Parameters<typeof numbersSteps>[2]) => numbersSteps(GAUGE, 'single', mash)
    const noMark = plan.filter((step) => step.kind !== 'mark' || step.name !== 'battle-start')
    expect(() => afterBattleStart(noMark, hide)).toThrow('the plan has no mark battle-start')
    const noUntil = plan.filter((step) => step !== start)
    expect(() => afterBattleStart(noUntil, hide)).toThrow('the plan has no mark battle-start')
  })
})
