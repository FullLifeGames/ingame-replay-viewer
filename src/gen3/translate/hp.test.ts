import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { itemOf, moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'
import { scaleHp } from './scale'
import { STATUS_ANIM } from './status'

const hp = (side: 'near' | 'far', value: number) => ({ op: 'hp', side, hp: value })
const hit = (side: 'near' | 'far') => ({ op: 'hit', side, effectiveness: 'normal' })

describe('scaleHp (D5)', () => {
  it('puts 24/48 at 50 of 100 (X15)', () => {
    expect(scaleHp({ hp: 24, max: 48 })).toBe(50)
    expect(sceneOf('|-damage|p2a: Tyranitar|24/48')).toContainEqual(hp('far', 50))
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

describe('damage with a cause', () => {
  it('says the weather, then hits and moves the bar', () => {
    expect(sceneOf('|-damage|p1a: Dugtrio|94/100|[from] Sandstorm').map(plain)).toEqual([
      'Dugtrio is buffeted by the sandstorm!',
      hit('near'),
      hp('near', 94),
    ])
  })

  it('says the poison, then plays its animation and moves the bar', () => {
    expect(sceneOf('|-damage|p2a: Tyranitar|88/100 psn|[from] psn').map(plain)).toEqual([
      'The opposing Tyranitar was hurt by its poisoning!',
      { op: 'anim', side: 'far', anim: 'statusPsn' },
      hp('far', 88),
    ])
  })

  it('plays the animation of the status that hurts, as a status given plays it', () => {
    for (const status of ['psn', 'tox', 'brn'] as const) {
      const scene = sceneOf(`|-damage|p2a: Tyranitar|88/100 ${status}|[from] ${status}`)
      expect(scene[1], status).toEqual({ op: 'anim', side: 'far', anim: STATUS_ANIM[status] })
    }
  })

  it('moves the bar before the line for Spikes and recoil', () => {
    const scene = sceneOf(
      '|-damage|p1a: Dugtrio|88/100|[from] Spikes',
      '|-damage|p2a: Tyranitar|90/100|[from] Recoil|[of] p1a: Dugtrio',
    )
    expect(scene.map(plain)).toEqual([
      hp('near', 88),
      'Dugtrio was hurt by the spikes!',
      hp('far', 90),
      'The opposing Tyranitar was damaged by the recoil!',
    ])
  })

  it("plays a trapping move's turn, says it, then moves the bar", () => {
    const scene = sceneOf('|-damage|p2a: Tyranitar|94/100|[from] move: Fire Spin')
    expect(scene.map(plain)).toEqual([
      { op: 'trapTurn', side: 'far', move: moveOf('Fire Spin').number },
      'The opposing Tyranitar is hurt by Fire Spin!',
      hp('far', 94),
    ])
  })

  it('drains a seeded Pokémon with the seed animation, bar, then the line', () => {
    const scene = sceneOf(
      '|-damage|p2a: Tyranitar|88/100|[from] Leech Seed|[of] p1a: Dugtrio',
      '|-heal|p1a: Dugtrio|100/100|[silent]',
    )
    expect(scene.map(plain)).toEqual([
      { op: 'anim', side: 'far', anim: 'leechSeedDrain' },
      hp('far', 88),
      "The opposing Tyranitar's health is sapped by Leech Seed!",
      hp('near', 100),
    ])
  })

  it('lists damage the game has no line for as a fallback', () => {
    const result = streamOfLog('|-damage|p1a: Dugtrio|50/100|[from] Mystery Wind')
    expect(result.fallbacks).toEqual([
      { line: NEXT, kind: 'phrase', detail: 'no game message for damage from Mystery Wind' },
    ])
  })
})

describe('damage with no cause', () => {
  it('moves the bar alone for a silent change and for HP a move user pays itself', () => {
    const scene = sceneOf(
      '|-damage|p2a: Tyranitar|50/100|[silent]',
      '|move|p1a: Dugtrio|Substitute|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|75/100',
    )
    expect(scene.map(plain)).toEqual([
      hp('far', 50),
      'Dugtrio used Substitute!',
      { op: 'move', user: 'near', target: 'near', move: expect.any(Number) as number, animTurn: 0 },
      hp('near', 75),
    ])
  })

  it('forgets the last user at the next turn', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Substitute|p1a: Dugtrio',
      '|turn|2',
      '|-damage|p1a: Dugtrio|75/100',
    )
    expect(scene.slice(2).map(plain)).toEqual([
      { op: 'turn', number: 2 },
      hit('near'),
      hp('near', 75),
    ])
  })
})

describe('heals', () => {
  it('shows the item pop-up, plays the held item effect and the heal, then moves the bar', () => {
    expect(sceneOf('|-heal|p1a: Dugtrio|56/100|[from] item: Leftovers').map(plain)).toEqual([
      { op: 'itemPopUp', side: 'near', item: itemOf('Leftovers').number },
      { op: 'anim', side: 'near', anim: 'heldItemEffect' },
      { op: 'anim', side: 'near', anim: 'simpleHeal' },
      hp('near', 56),
    ])
  })

  it('plays a Wish, says whose it was, moves the bar and says the HP came back', () => {
    const scene = sceneOf('|-heal|p2a: Tyranitar|100/100|[from] move: Wish|[wisher] Tyranitar')
    expect(scene.map(plain)).toEqual([
      { op: 'anim', side: 'far', anim: 'wishHeal' },
      "The opposing Tyranitar's wish came true!",
      hp('far', 100),
      "The opposing Tyranitar's HP was restored.",
    ])
  })

  it('moves the bar before the line of a recovery move or a drain', () => {
    const scene = sceneOf(
      '|-heal|p1a: Dugtrio|100/100',
      '|-heal|p2a: Tyranitar|60/100|[from] drain|[of] p1a: Dugtrio',
    )
    expect(scene.map(plain)).toEqual([
      hp('near', 100),
      "Dugtrio's HP was restored.",
      hp('far', 60),
      'Dugtrio had its energy drained!',
    ])
  })
})

/** The ops from the line `from` on, without the closing END. */
const opsFrom = (from: number, ...lines: string[]) =>
  streamOfLog(...lines)
    .instructions.filter(({ line, instruction }) => line >= from && instruction.op !== 'end')
    .map(({ instruction }) => plain(instruction))

// `BattleScript_EffectPainSplit`: the user's bar, the target's bar, then STRINGID_SHAREDPAIN.
describe('Pain Split', () => {
  it("moves the user's bar, then the target's, then says the battlers shared their pain", () => {
    const ops = opsFrom(
      NEXT + 1,
      '|move|p1a: Dugtrio|Pain Split|p2a: Tyranitar',
      '|-sethp|p2a: Tyranitar|60/100|[from] move: Pain Split|[silent]',
      '|-sethp|p1a: Dugtrio|60/100|[from] move: Pain Split',
    )
    expect(ops).toEqual([hp('near', 60), hp('far', 60), 'The battlers shared their pain!'])
  })

  it('reads the older line that names both Pokémon in either order, the user first', () => {
    const move = '|move|p2a: Tyranitar|Pain Split|p1a: Dugtrio'
    const shared = 'The battlers shared their pain!'
    const userLast = '|-sethp|p1a: Dugtrio|60|p2a: Tyranitar|60|[from] move: Pain Split'
    const userFirst = '|-sethp|p2a: Tyranitar|60|p1a: Dugtrio|60|[from] move: Pain Split'
    expect(opsFrom(NEXT + 1, move, userLast)).toEqual([hp('far', 60), hp('near', 60), shared])
    expect(opsFrom(NEXT + 1, move, userFirst)).toEqual([hp('far', 60), hp('near', 60), shared])
  })

  it('moves the bar alone for HP set outright with no Pain Split, and the next hit from there', () => {
    const ops = opsFrom(NEXT, '|-sethp|p1a: Dugtrio|50/100', '|-damage|p1a: Dugtrio|40/100')
    expect(ops).toEqual([hp('near', 50), hit('near'), hp('near', 40)])
  })
})
