import { describe, expect, it } from 'vitest'

import { GEN5_STAGE, GEN5_STATUS, GEN5_WEATHER, gen5Weather } from './effect-names.ts'

// Invented: the battle's constants by pokebw2's names, with values of their own.
const CONSTANTS = {
  BTL_WEATHER_NONE: 40,
  BTL_WEATHER_SANDSTORM: 41,
  BTL_WEATHER_RAIN: 43,
  BTL_WEATHER_SUN: 47,
  BTL_WEATHER_HAIL: 45,
}

// Scene: a Gen 9 log may start a snowstorm, and Black 2 has no weather for it; the replay stops
// at its line instead of showing another weather.
describe('gen5Weather', () => {
  it('names the weather Black 2 lacks with its line', () => {
    expect(() => gen5Weather(CONSTANTS, 'Snow', 12)).toThrow(
      new Error('Black 2 has no weather Snow (line 12)'),
    )
  })

  it("finds each weather Black 2 has by its constant's name", () => {
    expect(gen5Weather(CONSTANTS, 'Rain', 3)).toBe(43)
    expect(gen5Weather(CONSTANTS, 'Sun', 3)).toBe(47)
    expect(gen5Weather(CONSTANTS, 'Sand', 3)).toBe(41)
    expect(gen5Weather(CONSTANTS, 'Hail', 3)).toBe(45)
  })

  it('names a constant the generated file lacks', () => {
    const withoutHail = Object.fromEntries(
      Object.entries(CONSTANTS).filter(([name]) => name !== 'BTL_WEATHER_HAIL'),
    )
    expect(() => gen5Weather(withoutHail, 'Hail', 3)).toThrow(
      new Error('bw2.json has no BTL_WEATHER_HAIL'),
    )
  })
})

// Scene: the game names its weathers, statuses and stat stages in constants of its own, and no
// rule on @pkmn's names reaches them, so one record per kind lists each.
describe('the name maps', () => {
  it('leave the weathers of later games without a constant', () => {
    const none = Object.entries(GEN5_WEATHER).filter(([, constant]) => constant === undefined)
    expect(none.map(([name]) => name).sort()).toEqual([
      'Harsh Sunshine',
      'Heavy Rain',
      'Snow',
      'Strong Winds',
    ])
  })

  it('give bad poison the poison condition, marked as bad', () => {
    expect(GEN5_STATUS.tox).toEqual({ condition: 'CONDITION_POISON', badly: true })
    expect(GEN5_STATUS.psn).toEqual({ condition: 'CONDITION_POISON', badly: false })
    const badly = Object.entries(GEN5_STATUS).filter(([, status]) => status.badly)
    expect(badly.map(([name]) => name)).toEqual(['tox'])
  })

  it('give every other status and every stat a constant of its own', () => {
    const conditions = Object.entries(GEN5_STATUS)
      .filter(([name]) => name !== 'tox')
      .map(([, status]) => status.condition)
    expect(new Set(conditions).size).toBe(conditions.length)
    const stages = Object.values(GEN5_STAGE)
    expect(new Set(stages).size).toBe(stages.length)
    expect(stages.every((stage) => /^BATTLEMON_\w+_STAGE$/.test(stage))).toBe(true)
  })
})
