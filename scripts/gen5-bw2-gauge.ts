// The battle's gauge (#137), from pokebw2 at its pin: the near box's HP numbers are one sprite
// actor of a battler's gauge (`hpNumActor` of BtlvGaugeEntry, btlv_gauge.c), which the page finds
// from the effect work's root sBtlvEffect (btlv_effect.c) through BtlvEffect.gauge and
// BtlvGauge.entries, all by name. Two bit writes put that actor into OBJ window mode, so it draws
// nothing: `objMode` set to GX_OAM_MODE_OBJWND, with NNS_G2D_RND_OVERWRITE_OBJMODE in its
// `overwrite`. ClActor's layout runs through NitroSystem's image proxies, whose SDK enums lay out
// as words. Part of build/gen5/bw2.json; the errors name places and show no number of pokebw2.
import type { GaugeConstant, GaugeNumbers } from '../src/gen5/bw2-gauge-numbers.ts'
import { inOneByte } from '../src/gen5/bits-write.ts'
import type { Bw2Symbol, FieldLayout, StructLayout } from '../src/gen5/bw2-numbers.ts'
import { nearInside } from '../src/gen5/hp-numbers.ts'
import { inMainRam } from '../src/gen5/main-ram.ts'
import { WORD } from '../src/gen5/setup-chain.ts'
import { defineValue, enumAround, parseSymbols, pickSymbols } from './gen5-bw2-c.ts'
import { checkedLayout } from './gen5-bw2-struct.ts'

/** The overlay of the battle's effects, whose symbols list sBtlvEffect. */
export const EFFECT_OVERLAY = 'ov168'

/** The files of the gauge, by role. */
export const GAUGE_SOURCES = {
  effectSymbols: `config/b2_us/arm9/overlays/${EFFECT_OVERLAY}/symbols.txt`,
  effectC: 'src/moveeffect/btlv_effect.c',
  gaugeC: 'src/battle/graphic/btlv_gauge.c',
  mcssH: 'include/battle/graphic/btlv_mcss.h',
  clactH: 'include/gfl/clact.h',
  g2dH: 'lib/nnsys/include/nnsys/g2d.h',
  gxH: 'lib/nitro/include/nitro/gx.h',
  fxH: 'lib/nitro/include/nitro/fx.h',
}

/** The texts of GAUGE_SOURCES by role. */
export type GaugeInput = Record<keyof typeof GAUGE_SOURCES, string>

/** The members of ClActor that the hide checks or writes. */
const ACTOR_MEMBERS = ['unit', 'autoAnimSpeed', 'priority', 'overwrite', 'objMode']
const OBJMODE = 'NNS_G2D_RND_OVERWRITE_OBJMODE'
const OAM_OBJWND = 'GX_OAM_MODE_OBJWND'
const NEAR = 'BTLV_MCSS_POS_SINGLE_PLAYER'

function effectSymbol(symbols: string): Bw2Symbol {
  const { sBtlvEffect } = pickSymbols(parseSymbols(symbols, EFFECT_OVERLAY), ['sBtlvEffect'])
  if (sBtlvEffect?.kind !== 'bss') {
    throw new Error(`sBtlvEffect is no bss symbol of ${EFFECT_OVERLAY}`)
  }
  return sBtlvEffect
}

function gaugeLayouts(input: GaugeInput): GaugeNumbers['layouts'] {
  const gauge = checkedLayout(input.gaugeC, 'BtlvGauge', ['entries', 'loaded'], 'loaded')
  if (gauge.fields.loaded?.bits === undefined) throw new Error('BtlvGauge.loaded is no bit-field')
  const actorSource = [input.fxH, input.gxH, input.g2dH, input.clactH].join('\n')
  return {
    BtlvEffect: checkedLayout(input.effectC, 'BtlvEffect', ['gauge'], 'gauge'),
    BtlvGauge: gauge,
    BtlvGaugeEntry: checkedLayout(input.gaugeC, 'BtlvGaugeEntry', ['hpNumActor', 'expActor']),
    ClActor: checkedLayout(actorSource, 'ClActor', ACTOR_MEMBERS, 'cellOnly'),
  }
}

/** The value of `member` in the enum that names `anchor`; throws by both names without it. */
function enumMember(source: string, anchor: string, member: string): number {
  const value = enumAround(source, anchor)[member]
  if (value === undefined) throw new Error(`the enum of ${anchor} has no ${member}`)
  return value
}

/** An overwrite flag of OBJMODE's enum, which must be one bit inside ClActor.overwrite. */
function overwriteFlag(g2dH: string, name: string, overwrite: FieldLayout | undefined): number {
  const value = enumMember(g2dH, OBJMODE, name)
  const bit = Math.log2(value)
  if (!Number.isInteger(bit) || bit >= (overwrite?.bits ?? 0)) {
    throw new Error(`${name} is no single bit inside ClActor.overwrite`)
  }
  return value
}

function gaugeConstants(input: GaugeInput, actor: StructLayout): Record<GaugeConstant, number> {
  const { overwrite } = actor.fields
  return {
    GX_OAM_MODE_NORMAL: enumMember(input.gxH, OAM_OBJWND, 'GX_OAM_MODE_NORMAL'),
    GX_OAM_MODE_OBJWND: enumMember(input.gxH, OAM_OBJWND, OAM_OBJWND),
    NNS_G2D_RND_OVERWRITE_OBJMODE: overwriteFlag(input.g2dH, OBJMODE, overwrite),
    NNS_G2D_RND_OVERWRITE_PRIORITY: overwriteFlag(
      input.g2dH,
      'NNS_G2D_RND_OVERWRITE_PRIORITY',
      overwrite,
    ),
    FX32_SHIFT: defineValue(input.fxH, 'FX32_SHIFT'),
    BTLV_MCSS_POS_SINGLE_PLAYER: enumMember(input.mcssH, NEAR, NEAR),
  }
}

/** The gauge's places by name; throws by name on a struct, member, symbol or value it lacks. */
export function gaugeNumbers(input: GaugeInput): GaugeNumbers {
  const layouts = gaugeLayouts(input)
  return {
    effect: effectSymbol(input.effectSymbols),
    layouts,
    constants: gaugeConstants(input, layouts.ClActor),
  }
}

/** The `// 0x…` comment on the one line that declares `member`, an array of any length too. */
function commentOffset(source: string, member: string): number | undefined {
  const line = new RegExp(
    `^\\s*\\w+\\s*\\**\\s*${member}(?:\\[\\w+\\])?\\s*;\\s*//\\s*(0x[0-9a-f]+)`,
    'gim',
  )
  const found = [...source.matchAll(line)]
  return found.length === 1 ? Number(found[0]?.[1]) : undefined
}

/** The `0x… bytes` in the comment line above `typedef struct {` of the struct `name`. */
function commentSize(source: string, name: string): number | undefined {
  const lines = source.split('\n')
  const close = lines.findIndex((line) => new RegExp(`^\\}\\s*${name}\\s*;`).test(line))
  const open = lines
    .slice(0, Math.max(close, 0))
    .findLastIndex((line) => /^typedef\s+struct\b/.test(line))
  const size = open < 1 ? undefined : /(0x[0-9a-f]+) bytes/i.exec(lines[open - 1] ?? '')?.[1]
  return size === undefined ? undefined : Number(size)
}

/** True when both overwrite flags lie inside ClActor.overwrite's bits. */
function flagsInside({ layouts, constants }: GaugeNumbers): boolean {
  const room = 2 ** (layouts.ClActor.fields.overwrite?.bits ?? 0)
  const flags = [constants.NNS_G2D_RND_OVERWRITE_OBJMODE, constants.NNS_G2D_RND_OVERWRITE_PRIORITY]
  return flags.every((flag) => flag > 0 && flag < room)
}

/** The relations the gauge's numbers must hold, by name. */
function relations(gauge: GaugeNumbers, sources: Pick<GaugeInput, 'effectC' | 'gaugeC'>) {
  const { BtlvEffect, BtlvGauge, BtlvGaugeEntry, ClActor } = gauge.layouts
  return {
    "BtlvEffect.gauge at its comment's offset":
      BtlvEffect.fields.gauge?.offset === commentOffset(sources.effectC, 'gauge'),
    "BtlvGauge.entries at its comment's offset":
      BtlvGauge.fields.entries?.offset === commentOffset(sources.gaugeC, 'entries'),
    'BtlvGaugeEntry the size of its comment':
      BtlvGaugeEntry.size === commentSize(sources.gaugeC, 'BtlvGaugeEntry'),
    'objMode inside one byte': inOneByte(ClActor.fields.objMode),
    'both flags inside overwrite': flagsInside(gauge),
    'loaded one bit': BtlvGauge.fields.loaded?.bits === 1,
    'the near position inside the entries': nearInside(gauge),
    'sBtlvEffect in main RAM': inMainRam(gauge.effect.address, WORD),
  }
}

/** The names of the relations the numbers break; the real spec holds the generated ones to none.
 * A name shows no number, as CI's log is public. */
export const gaugeRelations = (
  gauge: GaugeNumbers,
  sources: Pick<GaugeInput, 'effectC' | 'gaugeC'>,
): string[] =>
  Object.entries(relations(gauge, sources))
    .filter(([, holds]) => !holds)
    .map(([name]) => name)
