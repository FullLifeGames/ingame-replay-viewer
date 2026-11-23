// The PSG channels of our platform layer (#43, plan B7), run natively in the host harness: the
// sound registers in, left and right floats in GBATEK's output units out.
// GBATEK "GBA Sound Channel 1 - Tone & Sweep", "GBA Sound Channel 2 - Tone", "GBA Sound Channel
// 3 - Wave Output", "GBA Sound Channel 4 - Noise" and "GBA Sound Control Registers".
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost } from './wasm-layer.ts'
import { load, read } from './wasm-layer-script.ts'
import {
  frequency,
  FULL,
  NR,
  runPsg,
  SOUNDCNT_H,
  SOUNDCNT_X,
  WAVE_RAM,
  write8,
} from './wasm-layer-sound.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-psg-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const START = 0x80
const LENGTH_FLAG = 0x40
const step = FULL / 15

/** The indices where the sign of the samples changes. */
function flips(values: readonly number[]): number[] {
  return values.flatMap((value, i) =>
    i > 0 && Math.sign(value) !== Math.sign(values[i - 1] as number) ? [i] : [],
  )
}

const differences = (indices: readonly number[]) =>
  indices.slice(1).map((at, i) => at - (indices[i] as number))
const lastSounding = (values: readonly number[]) => values.findLastIndex((value) => value !== 0)

/** Channel 1 as a tone of `n` with the duty, length and envelope bytes given. */
const tone1 = (n: number, nr11: number, nr12: number, control = START) => [
  write8(NR[11], nr11),
  write8(NR[12], nr12),
  ...frequency(NR[13], n, control),
]

describe('the tone channels', () => {
  it('play a 50 % duty square of 256 Hz with a period of 128 samples at 32768 Hz', () => {
    const { left, right } = runPsg(host, 32768, [{ ops: tone1(1536, 0x80, 0xf0), pairs: 1024 }])
    expect(new Set(left.map(Math.abs))).toEqual(new Set([FULL]))
    expect(new Set(differences(flips(left)))).toEqual(new Set([64]))
    expect(right).toEqual(left)
  })

  it.each([
    [0, 16],
    [1, 32],
    [2, 64],
    [3, 96],
  ])('hold duty %i high for %i of 128 samples', (duty, high) => {
    const { left } = runPsg(host, 32768, [{ ops: tone1(1536, duty << 6, 0xf0), pairs: 1024 }])
    expect(left.slice(256, 384).filter((value) => value > 0)).toHaveLength(high)
  })

  it('stop after 1/8 s with a length of 32 and the length flag, and clear their ON flag', () => {
    const rate = 42048
    const { left, reads } = runPsg(
      host,
      rate,
      [
        { ops: tone1(1536, 0x80 | 32, 0xf0, START | LENGTH_FLAG), pairs: 8000 },
        { ops: [read(SOUNDCNT_X, 1)] },
      ],
      1,
    )
    expect(lastSounding(left)).toBeGreaterThanOrEqual(Math.floor((31 / 256) * rate))
    expect(lastSounding(left)).toBeLessThanOrEqual(Math.ceil((32 / 256) * rate))
    expect(reads).toEqual([0x80])
  })

  it('play on past the length without the length flag', () => {
    const { left, reads } = runPsg(
      host,
      42048,
      [{ ops: tone1(1536, 0x80 | 32, 0xf0), pairs: 8000 }, { ops: [read(SOUNDCNT_X, 1)] }],
      1,
    )
    expect(lastSounding(left)).toBe(7999)
    expect(reads).toEqual([0x81])
  })

  it('decay by envelope step 1 in steps of 1/64 s, 657 samples at 42048 Hz', () => {
    const { left } = runPsg(host, 42048, [{ ops: tone1(1536, 0x80, 0xf1), pairs: 657 * 17 }])
    const levels = left.map((value) => Math.round(Math.abs(value) / step))
    const changes = levels.flatMap((level, i) => (i > 0 && level !== levels[i - 1] ? [i] : []))
    expect(changes).toHaveLength(15)
    expect(new Set(differences(changes))).toEqual(new Set([657]))
    expect(changes.map((at) => levels[at])).toEqual([
      14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ])
  })

  it('rise by an increasing envelope up to 15 and stay there', () => {
    const { left } = runPsg(host, 42048, [{ ops: tone1(1536, 0x80, 0x09), pairs: 657 * 17 }])
    expect(Math.round(Math.abs(left[100] as number) / step)).toBe(0)
    expect(Math.abs(left.at(-1) as number)).toBeCloseTo(FULL, 4)
  })

  it('clear the write-only Initial bit of each channel in the frame that consumed it', () => {
    const controls = [NR[14], NR[24], NR[34], NR[44]]
    const { reads } = runPsg(
      host,
      42048,
      [
        { ops: controls.map((address) => write8(address, 0xc5)), pairs: 1 },
        { ops: controls.map((address) => read(address, 1)) },
      ],
      4,
    )
    expect(reads).toEqual([0x45, 0x45, 0x45, 0x45])
  })

  it('sweep channel 1 up by X/2^n every 1/128 s, write it back, and stop past 2047', () => {
    const rate = 32768
    const { left, reads } = runPsg(
      host,
      rate,
      [
        { ops: [write8(NR[10], 0x11), ...tone1(1024, 0x80, 0xf0)], pairs: 300 },
        { ops: [read(NR[13], 2)] },
        { ops: [], pairs: 300 },
        { ops: [read(SOUNDCNT_X, 1)] },
      ],
      3,
    )
    expect(reads).toEqual([0x00, 0x06, 0x80])
    expect(left.at(-1)).toBe(0)
  })
})

/** Channel 3 at `n`, its volume byte and NR30, restarted. */
const wave3 = (n: number, nr30: number, nr32 = 0x20) => [
  write8(NR[30], nr30),
  write8(NR[32], nr32),
  ...frequency(NR[33], n, START),
]
const RAMP = Array.from({ length: 16 }, (_, i) => ((2 * i) % 16) * 16 + ((2 * i + 1) % 16))
const digitsOf = (values: readonly number[]) =>
  values.map((value) => Math.round((value / step + 15) / 2))
// 2097152 / (2048 - 1984) digits per second: one digit per sample at 32768 Hz.
const DIGIT_RATE_N = 1984

describe('the wave channel', () => {
  it('plays the wave RAM high nibble first, one digit per sample at 32768 Hz', () => {
    const { left } = runPsg(host, 32768, [
      { ops: [write8(NR[30], 0x40), load(WAVE_RAM, RAMP)], pairs: 1 },
      { ops: wave3(DIGIT_RATE_N, 0x80), pairs: 64 },
    ])
    const digits = digitsOf(left.slice(1))
    expect(differences(digits).every((change) => change === 1 || change === -15)).toBe(true)
  })

  it('plays bank 1 while bank 0 is written, then bank 0 once NR30 selects it', () => {
    const high = Array(16).fill(0xff)
    const low = Array(16).fill(0x00)
    const { left } = runPsg(host, 32768, [
      { ops: [write8(NR[30], 0x00), load(WAVE_RAM, high)], pairs: 1 },
      { ops: wave3(DIGIT_RATE_N, 0xc0), pairs: 64 },
      { ops: [load(WAVE_RAM, low)], pairs: 64 },
      { ops: [write8(NR[30], 0x80)], pairs: 64 },
    ])
    expect(new Set(left.slice(1, 129))).toEqual(new Set([FULL]))
    expect(new Set(left.slice(129))).toEqual(new Set([-FULL]))
  })

  it("plays the wave that CgbSound's note start writes inside one frame (U/src/m4a.c)", () => {
    const high = Array(16).fill(0xff)
    const { left } = runPsg(host, 32768, [
      {
        ops: [
          write8(NR[30], 0x40),
          load(WAVE_RAM, high),
          write8(NR[30], 0),
          write8(NR[31], 0),
          ...wave3(DIGIT_RATE_N, 0x80),
        ],
        pairs: 64,
      },
    ])
    expect(new Set(left)).toEqual(new Set([FULL]))
  })

  it('plays 64 digits, the selected bank first, with the two-bank dimension', () => {
    const { left } = runPsg(host, 32768, [
      { ops: [write8(NR[30], 0x40), load(WAVE_RAM, Array(16).fill(0xff))], pairs: 1 },
      { ops: [write8(NR[30], 0x00), load(WAVE_RAM, Array(16).fill(0x00))], pairs: 1 },
      { ops: wave3(DIGIT_RATE_N, 0xa0), pairs: 128 },
    ])
    const signs = left.slice(2).map(Math.sign)
    expect(signs.filter((sign) => sign > 0)).toHaveLength(64)
    expect(flips(left.slice(2)).length).toBeGreaterThanOrEqual(2)
  })

  it.each([
    [0x00, 0],
    [0x20, 15],
    [0x40, 7],
    [0x60, 3],
    [0x80, 11],
  ])('scales a digit of 15 by the volume byte %i to %i', (nr32, level) => {
    const { left } = runPsg(host, 32768, [
      { ops: [write8(NR[30], 0x40), load(WAVE_RAM, Array(16).fill(0xff))], pairs: 1 },
      { ops: wave3(DIGIT_RATE_N, 0x80, nr32), pairs: 32 },
    ])
    expect(Math.min(...left.slice(1))).toBeCloseTo(level * step, 4)
    expect(Math.max(...left.slice(1))).toBeCloseTo(level * step, 4)
  })
})

/** Channel 4 at 32768 shifts per second (r 1, s 3), volume 15, restarted. */
const noise4 = (width: number) => [
  write8(NR[42], 0xf0),
  write8(NR[43], 0x31 | width),
  write8(NR[44], START),
]

describe('the noise channel', () => {
  it('repeats after 127 steps with the 7-bit width', () => {
    const { left } = runPsg(host, 32768, [{ ops: noise4(0x08), pairs: 512 }])
    const signs = left.map(Math.sign)
    expect(signs.slice(0, 385)).toEqual(signs.slice(127, 512))
    expect(new Set(signs)).toEqual(new Set([1, -1]))
  })

  it('repeats after 32767 steps with the 15-bit width, not after 127', () => {
    const { left } = runPsg(host, 32768, [{ ops: noise4(0x00), pairs: 32767 + 1000 }])
    const signs = left.map(Math.sign)
    expect(signs.slice(0, 1000)).toEqual(signs.slice(32767))
    expect(signs.slice(0, 1000)).not.toEqual(signs.slice(127, 1127))
  })
})

describe('the control registers', () => {
  it.each([
    { nr50: 0x77, nr51: 0xff, mix: 0x02, left: FULL, right: FULL },
    { nr50: 0x37, nr51: 0x10, mix: 0x02, left: FULL / 2, right: 0 },
    { nr50: 0x70, nr51: 0x01, mix: 0x02, left: 0, right: FULL / 8 },
    { nr50: 0x77, nr51: 0x11, mix: 0x01, left: FULL / 2, right: FULL / 2 },
    { nr50: 0x77, nr51: 0x11, mix: 0x00, left: FULL / 4, right: FULL / 4 },
  ])(
    'NR50 $nr50, NR51 $nr51 and SOUNDCNT_H $mix give channel 1 $left left and $right right',
    ({ nr50, nr51, mix, left, right }) => {
      const run = runPsg(host, 32768, [
        {
          ops: [
            write8(NR[50], nr50),
            write8(NR[51], nr51),
            write8(SOUNDCNT_H, mix),
            ...tone1(1536, 0x80, 0xf0),
          ],
          pairs: 256,
        },
      ])
      expect(Math.max(...run.left.map(Math.abs))).toBeCloseTo(left, 4)
      expect(Math.max(...run.right.map(Math.abs))).toBeCloseTo(right, 4)
    },
  )

  it('silence the PSG and clear its registers while the master enable is off', () => {
    const { left, reads } = runPsg(
      host,
      32768,
      [
        { ops: tone1(1536, 0x80, 0xf0), pairs: 64 },
        { ops: [write8(SOUNDCNT_X, 0x00)], pairs: 64 },
        { ops: [read(NR[12], 1)] },
      ],
      1,
    )
    expect(left.slice(0, 64).every((value) => value !== 0)).toBe(true)
    expect(left.slice(64).every((value) => value === 0)).toBe(true)
    expect(reads).toEqual([0])
  })
})
