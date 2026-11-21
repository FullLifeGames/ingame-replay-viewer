import { describe, expect, it } from 'vitest'

import header from '../../../rom/gen3/include/replay_stream.h?raw'
import * as format from './format'

type Numbers = Readonly<Record<string, number>>

const snake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

// The name rule between the two definitions: `OP.sendOut` is REPLAY_OP_SEND_OUT, `OP_SIZE.turn`
// is REPLAY_OP_TURN_SIZE, `STREAM_OFFSET.headerSize` is REPLAY_STREAM_OFFSET_HEADER_SIZE.
const GROUPS: readonly (readonly [Numbers, string, string])[] = [
  [format.STREAM, 'REPLAY_STREAM_', ''],
  [format.STREAM_OFFSET, 'REPLAY_STREAM_OFFSET_', ''],
  [format.TRAINER, 'REPLAY_TRAINER_', ''],
  [format.TRAINER_OFFSET, 'REPLAY_TRAINER_OFFSET_', ''],
  [format.MON, 'REPLAY_MON_', ''],
  [format.MON_OFFSET, 'REPLAY_MON_OFFSET_', ''],
  [format.INSTRUCTION, 'REPLAY_INSTRUCTION_', ''],
  [format.OP, 'REPLAY_OP_', ''],
  [format.OP_SIZE, 'REPLAY_OP_', '_SIZE'],
  [format.PRINT_SIZE, 'REPLAY_PRINT_', '_SIZE'],
  [format.SIDE, 'REPLAY_SIDE_', ''],
  [format.GENDER, 'REPLAY_GENDER_', ''],
  [format.OUTCOME, 'REPLAY_OUTCOME_', ''],
  [format.STATUS, 'REPLAY_STATUS_', ''],
  [format.WEATHER, 'REPLAY_WEATHER_', ''],
  [format.STAT, 'REPLAY_STAT_', ''],
  [format.ARROWS, 'REPLAY_ARROWS_', ''],
  [format.EFFECTIVENESS, 'REPLAY_EFFECTIVENESS_', ''],
  [format.VOLATILE, 'REPLAY_VOLATILE_', ''],
  [format.ANIM, 'REPLAY_ANIM_', ''],
]

function tsDefines(): Map<string, number> {
  const defines = new Map<string, number>()
  for (const [group, prefix, suffix] of GROUPS) {
    for (const [key, value] of Object.entries(group)) {
      const name = `${prefix}${snake(key)}${suffix}`
      expect(defines.has(name), `${name} twice`).toBe(false)
      defines.set(name, value)
    }
  }
  return defines
}

function cDefines(text: string): Map<string, number> {
  const defines = new Map<string, number>()
  for (const match of text.matchAll(/^#define\s+(REPLAY_\w+)\s+(\S+)/gm)) {
    const [, name, value] = match as unknown as [string, string, string]
    expect(value, `${name} is a plain number`).toMatch(/^(?:0x[0-9A-F]+|-?\d+)$/)
    defines.set(name, Number(value))
  }
  return defines
}

describe('the stream format in TypeScript and in replay_stream.h (F6)', () => {
  const ts = tsDefines()
  const c = cDefines(header)

  it('gives every TypeScript entry its define with the same value', () => {
    for (const [name, value] of ts) expect([name, c.get(name)]).toEqual([name, value])
  })

  it('gives every REPLAY_ define its TypeScript entry', () => {
    for (const name of c.keys()) expect(ts.has(name), `${name} has no TypeScript entry`).toBe(true)
  })

  it('checks each struct offset and size in C with a STATIC_ASSERT', () => {
    const asserts = [...header.matchAll(/^STATIC_ASSERT\((.+), \w+\);$/gm)].map((m) => m[1])
    const sizes = ['STREAM_HEADER_SIZE', 'TRAINER_SIZE', 'MON_SIZE', 'STREAM_TABLES_END']
    const checked = [
      ...[...c.keys()].filter((name) => name.includes('_OFFSET_')),
      ...sizes.map((name) => `REPLAY_${name}`),
    ]
    for (const name of checked) {
      expect(
        asserts.some((line) => line?.endsWith(`== ${name}`)),
        `${name} asserted`,
      ).toBe(true)
    }
  })

  it('places the tables one after another, even-aligned', () => {
    const { STREAM, TRAINER, MON } = format
    expect(STREAM.trainersOffset).toBe(STREAM.headerSize)
    expect(STREAM.monsOffset).toBe(STREAM.trainersOffset + STREAM.sideCount * TRAINER.size)
    expect(STREAM.tablesEnd).toBe(
      STREAM.monsOffset + STREAM.sideCount * STREAM.partySize * MON.size,
    )
    for (const offset of [STREAM.trainersOffset, STREAM.monsOffset, STREAM.tablesEnd]) {
      expect(offset % 4).toBe(0)
    }
  })
})
