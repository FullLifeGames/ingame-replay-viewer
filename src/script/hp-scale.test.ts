import { describe, expect, it } from 'vitest'

import { scaleHp } from './hp-scale'

describe('scaleHp (D5)', () => {
  it('puts 24/48 at 50 of 100 (X15)', () => {
    expect(scaleHp({ hp: 24, max: 48 })).toBe(50)
  })

  it('keeps 1 HP for a Pokémon with HP left and 99 for one that lost some', () => {
    expect(scaleHp({ hp: 1, max: 300 })).toBe(1)
    expect(scaleHp({ hp: 299, max: 300 })).toBe(99)
    expect(scaleHp({ hp: 0, max: 300 })).toBe(0)
    expect(scaleHp({ hp: 300, max: 300 })).toBe(100)
    expect(scaleHp({ hp: 71, max: 100 })).toBe(71)
  })

  it('puts exact full HP at 100, where floating point would land past it (#41)', () => {
    expect(scaleHp({ hp: 319, max: 319 })).toBe(100)
    expect(scaleHp({ hp: 364, max: 364 })).toBe(100)
  })

  it('rounds a fractional HP out of 100 to a whole number (#41)', () => {
    expect(scaleHp({ hp: 0.5, max: 100 })).toBe(1)
    expect(scaleHp({ hp: 33.3, max: 100 })).toBe(33)
  })

  it('gives a whole number from 0 to 100 for every maximum up to 999', () => {
    for (let max = 1; max <= 999; max++) {
      for (const value of [0, 1, max - 1, max]) {
        const scaled = scaleHp({ hp: value, max })
        expect(
          Number.isInteger(scaled),
          `${String(value)}/${String(max)} gives ${String(scaled)}`,
        ).toBe(true)
        expect(scaled).toBeGreaterThanOrEqual(0)
        expect(scaled).toBeLessThanOrEqual(100)
      }
    }
  })
})
