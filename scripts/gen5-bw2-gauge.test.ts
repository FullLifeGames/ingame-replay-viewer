import { describe, expect, it } from 'vitest'

import { gaugeNumbers, gaugeRelations } from './gen5-bw2-gauge'
import { GAUGE_INPUT, ODD_READ_GAUGE } from './gen5-bw2-gauge.fixtures'

const swap = (role: keyof typeof GAUGE_INPUT, from: string, to: string) => {
  if (!GAUGE_INPUT[role].includes(from)) throw new Error(`the fixture's ${role} lacks ${from}`)
  return { ...GAUGE_INPUT, [role]: GAUGE_INPUT[role].replace(from, to) }
}

// Scene: the near box's HP numbers live on one actor of the battle's gauge, and the page finds it
// from sBtlvEffect through the gauge's entries by the layouts the reader gives (#137).
describe('gaugeNumbers', () => {
  it('lays out ClActor with an enum member as a word', () => {
    const { ClActor } = gaugeNumbers(GAUGE_INPUT).layouts
    expect(ClActor).toEqual({
      size: 0x1c,
      align: 4,
      upTo: 'cellOnly',
      fields: {
        autoAnimSpeed: { offset: 0x00, size: 4 },
        pos: { offset: 0x04, size: 4 },
        'pos.x': { offset: 0x04, size: 2 },
        'pos.y': { offset: 0x06, size: 2 },
        imgProxy: { offset: 0x08, size: 0x0c },
        'imgProxy.fmt': { offset: 0x08, size: 4 },
        'imgProxy.vramLocation': { offset: 0x0c, size: 8 },
        'imgProxy.vramLocation.baseAddrOfVram': { offset: 0x0c, size: 8 },
        unit: { offset: 0x14, size: 4 },
        rotation: { offset: 0x18, size: 2 },
        overwrite: { offset: 0x18, size: 4, bit: 16, bits: 3 },
        objMode: { offset: 0x18, size: 4, bit: 19, bits: 3 },
        priority: { offset: 0x18, size: 4, bit: 22, bits: 6 },
        cellOnly: { offset: 0x18, size: 4, bit: 28, bits: 1 },
      },
    })
  })

  it('finds the symbol, the chain to the entries and the constants by name', () => {
    const { effect, layouts, constants } = gaugeNumbers(GAUGE_INPUT)
    expect(effect).toEqual({
      name: 'sBtlvEffect',
      kind: 'bss',
      address: 0x0221b7e4,
      module: 'ov168',
    })
    expect(layouts.BtlvEffect.fields.gauge).toEqual({ offset: 0x2c, size: 4 })
    expect(layouts.BtlvGauge.fields.entries).toEqual({ offset: 0x08, size: 0x60 })
    expect(layouts.BtlvGauge.fields.loaded).toEqual({ offset: 0x68, size: 4, bit: 3, bits: 1 })
    expect(layouts.BtlvGaugeEntry.size).toBe(0x20)
    expect(layouts.BtlvGaugeEntry.fields.hpNumActor).toEqual({ offset: 0x08, size: 4 })
    expect(layouts.BtlvGaugeEntry.fields.expActor).toEqual({ offset: 0x0c, size: 4 })
    expect(constants).toEqual({
      GX_OAM_MODE_NORMAL: 1,
      GX_OAM_MODE_OBJWND: 3,
      NNS_G2D_RND_OVERWRITE_OBJMODE: 2,
      NNS_G2D_RND_OVERWRITE_PRIORITY: 4,
      FX32_SHIFT: 10,
      BTLV_MCSS_POS_SINGLE_PLAYER: 2,
    })
  })

  it('throws by name on a gauge source without hpNumActor', () => {
    const input = swap('gaugeC', 'ClActor *hpNumActor;', 'ClActor *hpTextActor;')
    expect(() => gaugeNumbers(input)).toThrow('BtlvGaugeEntry lacks hpNumActor')
  })

  it('throws by name on an overwrite enum without the OBJMODE member', () => {
    const input = swap('g2dH', 'NNS_G2D_RND_OVERWRITE_OBJMODE =', 'NNS_G2D_RND_OVERWRITE_OBJTYPE =')
    expect(() => gaugeNumbers(input)).toThrow('no enum names NNS_G2D_RND_OVERWRITE_OBJMODE')
  })

  it('throws by name on an overwrite enum without the PRIORITY member', () => {
    const input = swap('g2dH', 'NNS_G2D_RND_OVERWRITE_PRIORITY =', 'NNS_G2D_RND_OVERWRITE_ORDER =')
    expect(() => gaugeNumbers(input)).toThrow(
      'the enum of NNS_G2D_RND_OVERWRITE_OBJMODE has no NNS_G2D_RND_OVERWRITE_PRIORITY',
    )
  })

  it('throws by name on a flag that is no single bit or lies past overwrite', () => {
    const twoBits = swap('g2dH', 'OBJMODE = 1 << 1', 'OBJMODE = 3')
    expect(() => gaugeNumbers(twoBits)).toThrow(
      'NNS_G2D_RND_OVERWRITE_OBJMODE is no single bit inside ClActor.overwrite',
    )
    const past = swap('g2dH', 'PRIORITY = 1 << 2', 'PRIORITY = 1 << 3')
    expect(() => gaugeNumbers(past)).toThrow(
      'NNS_G2D_RND_OVERWRITE_PRIORITY is no single bit inside ClActor.overwrite',
    )
  })

  it('throws by name on an sBtlvEffect outside bss and on a loaded that is no bit-field', () => {
    const data = swap('effectSymbols', 'sBtlvEffect kind:bss', 'sBtlvEffect kind:data')
    expect(() => gaugeNumbers(data)).toThrow('sBtlvEffect is no bss symbol of ov168')
    const whole = swap('gaugeC', 'u32 loaded : 1;', 'u32 loaded;')
    expect(() => gaugeNumbers(whole)).toThrow('BtlvGauge.loaded is no bit-field')
  })
})

// Scene: CI's log is public, so the real spec holds the generated gauge to relations alone and a
// broken one shows up by its name.
describe('gaugeRelations', () => {
  const broken = (input: typeof GAUGE_INPUT) => gaugeRelations(gaugeNumbers(input), input)

  it('holds every relation on the fixture', () => {
    expect(broken(GAUGE_INPUT)).toEqual([])
  })

  it('names an offset or a size that differs from its comment', () => {
    expect(broken(swap('effectC', '// 0x2c', '// 0x30'))).toEqual([
      "BtlvEffect.gauge at its comment's offset",
    ])
    expect(broken(swap('gaugeC', 'entries[3]; // 0x08', 'entries[3]; // 0x0c'))).toEqual([
      "BtlvGauge.entries at its comment's offset",
    ])
    expect(broken(swap('gaugeC', "A battler's gauge, 0x20 bytes", "A battler's gauge"))).toEqual([
      'BtlvGaugeEntry the size of its comment',
    ])
  })

  it('names an objMode across a byte, a near position past the entries and a root outside main RAM', () => {
    expect(broken(swap('clactH', 'overwrite : 3;', 'overwrite : 6;'))).toEqual([
      'objMode inside one byte',
    ])
    expect(broken(swap('mcssH', 'SINGLE_PLAYER = 2', 'SINGLE_PLAYER = 3'))).toEqual([
      'the near position inside the entries',
    ])
    expect(broken(swap('effectSymbols', 'addr:0x0221b7e4', 'addr:0x0121b7e4'))).toEqual([
      'sBtlvEffect in main RAM',
    ])
  })

  it('names a loaded of more than one bit and a flag past overwrite', () => {
    expect(broken(swap('gaugeC', 'loaded : 1;', 'loaded : 2;'))).toEqual(['loaded one bit'])
    const gauge = gaugeNumbers(GAUGE_INPUT)
    const constants = { ...gauge.constants, ...ODD_READ_GAUGE.constants }
    expect(gaugeRelations({ ...gauge, constants }, GAUGE_INPUT)).toEqual([
      'both flags inside overwrite',
    ])
  })
})
