// The hide of the near box's HP numbers (#137, way G of #119): the numbers are one sprite actor
// of the battle's gauge, `hpNumActor` of the near BtlvGaugeEntry, which the page finds from the
// effect work's root sBtlvEffect through BtlvEffect.gauge and BtlvGauge.entries. Once the gauges
// exist after the mark `battle-start` and before the near send-in, two bit writes put that actor
// into OBJ window mode, where it draws nothing: `objMode` set to GX_OAM_MODE_OBJWND, and the
// OBJMODE bit of its `overwrite`. The until before them waits for what ClActor_Reset always
// leaves, so a layout read wrong fails by name and writes nothing. A double's near boxes keep
// their numbers. Pure: the numbers come in from build/gen5/bw2.json's `gauge`.
import { bitsWrite } from './bits-write.ts'
import type { GaugeNumbers } from './bw2-gauge-numbers.ts'
import type { FieldLayout } from './bw2-numbers.ts'
import type { MacroStep } from './macro.ts'
import type { RamCheck } from './ram-check.ts'
import type { MemoryWrite } from './ram-write.ts'
import { width } from './setup-chain.ts'

/** Frames the gauges may take after the mark battle-start. In #119's probe they stood 14 frames
 * after it, and the near box showed only many hundred frames later, so a fault stops the run
 * before a box shows numbers. */
export const GAUGES_LIMIT = 300

/** The input of an until step while it waits. */
type Mash = Extract<MacroStep, { kind: 'until' }>['mash']

/** The steps of the HP numbers and the log line that says what the box shows. */
export interface HpNumbersSteps {
  steps: MacroStep[]
  line: string
}

/** The line of a plan that leaves the numbers as the game draws them. */
export const SHOWN_LINE = 'HP numbers: shown'
const HIDDEN_LINE = 'HP numbers: hidden in the near box'
const DOUBLE_LINE = "HP numbers: shown; a double's near boxes keep them (#137 hides a single's)"

const NEAR = 'BTLV_MCSS_POS_SINGLE_PLAYER'

function member(gauge: GaugeNumbers, struct: keyof GaugeNumbers['layouts'], name: string) {
  const field = gauge.layouts[struct].fields[name]
  if (field === undefined) throw new Error(`the gauge has no ${struct}.${name}`)
  return field
}

/** True when the near position indexes one of BtlvGauge's entries. */
export function nearInside(gauge: GaugeNumbers): boolean {
  const entries = gauge.layouts.BtlvGauge.fields.entries?.size ?? 0
  const near = gauge.constants[NEAR]
  return near >= 0 && (near + 1) * gauge.layouts.BtlvGaugeEntry.size <= entries
}

/** The hops from sBtlvEffect to the near entry's hpNumActor pointer. */
function toActor(gauge: GaugeNumbers): number[] {
  if (!nearInside(gauge)) throw new Error(`the gauge has no entry at ${NEAR}`)
  const entries = member(gauge, 'BtlvGauge', 'entries').offset
  const near = gauge.constants[NEAR] * gauge.layouts.BtlvGaugeEntry.size
  const slot = entries + near + member(gauge, 'BtlvGaugeEntry', 'hpNumActor').offset
  return [member(gauge, 'BtlvEffect', 'gauge').offset, slot]
}

/** The chain from sBtlvEffect to `fieldOffset` inside the near hpNumActor. */
function gaugeChain(gauge: GaugeNumbers, fieldOffset: number) {
  return { address: gauge.effect.address, hops: [...toActor(gauge), fieldOffset] }
}

/** A one-bit field at the bit of `flag` inside `overwrite`'s bits. */
const flagBit = (overwrite: FieldLayout, flag: number): FieldLayout => ({
  offset: overwrite.offset,
  size: overwrite.size,
  ...(overwrite.bit === undefined ? {} : { bit: overwrite.bit + Math.log2(flag), bits: 1 }),
})

/** A check that the bit-field `at` behind `chain` holds `value`, read as its one byte. */
function bitsCheck(
  name: string,
  chain: { address: number; hops: readonly number[] },
  at: FieldLayout,
  value: number,
): RamCheck {
  const write = bitsWrite(name, chain, at, value)
  return {
    name,
    address: write.address,
    hops: write.hops,
    width: 1,
    mask: write.mask,
    oneOf: [write.value],
  }
}

/** The checks of `until gauges`: the chain's pointers into main RAM, the gauges loaded, and the
 * near actor as ClActor_Reset leaves it: in its unit, at one animation step a frame, with its
 * PRIORITY overwrite and its OBJ mode normal. */
export function gaugeChecks(gauge: GaugeNumbers): RamCheck[] {
  const { address } = gauge.effect
  const toSlot = toActor(gauge)
  const toGauge = toSlot.slice(0, 1)
  const actor = (name: string) => gaugeChain(gauge, member(gauge, 'ClActor', name).offset)
  const speed = member(gauge, 'ClActor', 'autoAnimSpeed')
  const pointer = { width: 4, mainRamPointer: true } as const
  const { constants } = gauge
  const overwrite = member(gauge, 'ClActor', 'overwrite')
  const priority = flagBit(overwrite, constants.NNS_G2D_RND_OVERWRITE_PRIORITY)
  const loaded = member(gauge, 'BtlvGauge', 'loaded')
  return [
    { name: 'sBtlvEffect', address, ...pointer },
    { name: 'effect.gauge', address, hops: toGauge, ...pointer },
    { name: 'near.hpNumActor', address, hops: toSlot, ...pointer },
    { name: 'actor.unit', ...actor('unit'), ...pointer },
    bitsCheck('gauge.loaded', { address, hops: [...toGauge, loaded.offset] }, loaded, 1),
    {
      name: 'actor.autoAnimSpeed',
      ...actor('autoAnimSpeed'),
      width: width(speed, 'actor.autoAnimSpeed'),
      oneOf: [2 ** constants.FX32_SHIFT],
    },
    bitsCheck('actor.overwrite.priority', actor('overwrite'), priority, 1),
    bitsCheck(
      'actor.objMode',
      actor('objMode'),
      member(gauge, 'ClActor', 'objMode'),
      constants.GX_OAM_MODE_NORMAL,
    ),
  ]
}

/** The two writes that hide the near numbers: objMode to OBJ window, and its overwrite flag. */
export function hideWrites(gauge: GaugeNumbers): MemoryWrite[] {
  const { constants } = gauge
  const mode = member(gauge, 'ClActor', 'objMode')
  const overwrite = member(gauge, 'ClActor', 'overwrite')
  const flag = flagBit(overwrite, constants.NNS_G2D_RND_OVERWRITE_OBJMODE)
  return [
    bitsWrite(
      'hpNumActor.objMode',
      gaugeChain(gauge, mode.offset),
      mode,
      constants.GX_OAM_MODE_OBJWND,
    ),
    bitsWrite('hpNumActor.overwrite', gaugeChain(gauge, overwrite.offset), flag, 1),
  ]
}

/** For a single: `until gauges` with `mash`, then `write hide-numbers`. A double gets no step. */
export function numbersSteps(
  gauge: GaugeNumbers,
  style: 'single' | 'double',
  mash: Mash,
): HpNumbersSteps {
  if (style === 'double') return { steps: [], line: DOUBLE_LINE }
  const writes = hideWrites(gauge)
  const until: MacroStep = {
    kind: 'until',
    name: 'gauges',
    checks: gaugeChecks(gauge),
    holdFor: 1,
    limit: GAUGES_LIMIT,
    ...(mash === undefined ? {} : { mash }),
  }
  return { steps: [until, { kind: 'write', name: 'hide-numbers', writes }], line: HIDDEN_LINE }
}

/** `steps` with the steps of `hide` right after the mark battle-start. `hide` gets the mash of
 * the until battle-start, so A keeps its beat through the opening. */
export function afterBattleStart(
  steps: readonly MacroStep[],
  hide: (mash: Mash) => HpNumbersSteps,
): HpNumbersSteps {
  const at = steps.findIndex((step) => step.kind === 'mark' && step.name === 'battle-start')
  const start = steps[at - 1]
  if (at < 0 || start?.kind !== 'until' || start.name !== 'battle-start') {
    throw new Error('the plan has no mark battle-start after its until battle-start')
  }
  const { steps: added, line } = hide(start.mash)
  return { steps: [...steps.slice(0, at + 1), ...added, ...steps.slice(at + 1)], line }
}
