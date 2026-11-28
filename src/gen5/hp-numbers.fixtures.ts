// The invented gauge of the HP numbers' hide (#137): pokebw2's names with an address, offsets,
// sizes, bits and values of their own, the members of each struct in an order and widths of their
// own, and three entries with the near one in the middle. scripts/gen5-fixtures-real.test.ts
// holds that no number here equals the generated one under the same name.
import type { GaugeNumbers } from './bw2-gauge-numbers.ts'
import type { FieldLayout } from './bw2-numbers.ts'

export const GAUGE: GaugeNumbers = {
  effect: { name: 'sBtlvEffect', kind: 'bss', address: 0x0221c4a8, module: 'ov168' },
  layouts: {
    BtlvEffect: {
      size: 0x24,
      align: 4,
      fields: { gauge: { offset: 0x14, size: 4 } },
      upTo: 'gauge',
    },
    BtlvGauge: {
      size: 0x64,
      align: 4,
      fields: {
        entries: { offset: 0x0c, size: 0x54 },
        loaded: { offset: 0x60, size: 4, bit: 6, bits: 1 },
      },
      upTo: 'loaded',
    },
    BtlvGaugeEntry: {
      size: 0x1c,
      align: 4,
      fields: { hpNumActor: { offset: 0x10, size: 4 }, expActor: { offset: 0x14, size: 4 } },
    },
    ClActor: {
      size: 0x2c,
      align: 4,
      fields: {
        autoAnimSpeed: { offset: 0x08, size: 4 },
        unit: { offset: 0x24, size: 4 },
        overwrite: { offset: 0x28, size: 4, bit: 2, bits: 5 },
        objMode: { offset: 0x28, size: 4, bit: 13, bits: 2 },
        priority: { offset: 0x28, size: 4, bit: 15, bits: 6 },
      },
      upTo: 'priority',
    },
  },
  constants: {
    GX_OAM_MODE_NORMAL: 3,
    GX_OAM_MODE_OBJWND: 1,
    NNS_G2D_RND_OVERWRITE_OBJMODE: 4,
    NNS_G2D_RND_OVERWRITE_PRIORITY: 16,
    FX32_SHIFT: 7,
    BTLV_MCSS_POS_SINGLE_PLAYER: 1,
  },
}

/** The places that hp-numbers.test.ts puts into GAUGE one at a time to see each throw by name: an
 * objMode across a byte, an overwrite that is no bit-field, a near position past the entries and
 * a gauge entry without members. Shaped as the gauge's parts, so the guard compares each by name. */
export const ODD_GAUGE = {
  layouts: {
    ClActor: {
      fields: {
        objMode: { offset: 0x28, size: 4, bit: 15, bits: 2 },
        overwrite: { offset: 0x28, size: 4 },
      },
    },
    BtlvGaugeEntry: { fields: {} },
  },
  constants: { BTLV_MCSS_POS_SINGLE_PLAYER: 3 },
} satisfies {
  layouts: Record<'ClActor' | 'BtlvGaugeEntry', { fields: Record<string, FieldLayout> }>
  constants: Partial<GaugeNumbers['constants']>
}
