import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import { plain, sceneOf } from '../testing'

const skarmory = '|switch|p2a: Skarmory|Skarmory, F|100/100'

describe('switches', () => {
  it('withdraws the far Pokémon before the switch-in (X2)', () => {
    expect(sceneOf(skarmory).map(plain)).toEqual([
      'Bob withdrew Tyranitar!',
      { op: 'withdraw', side: 'far' },
      'Bob sent out Skarmory!',
      { op: 'switchIn', side: 'far', slot: 1, hp: 100, status: 'none' },
    ])
  })

  it('calls the near Pokémon back and keeps the HP and status of the one it sends', () => {
    expect(sceneOf('|switch|p1a: Zapdos|Zapdos|71/100 par').map(plain)).toEqual([
      'Dugtrio, come back!',
      { op: 'withdraw', side: 'near' },
      'Go! Zapdos!',
      { op: 'switchIn', side: 'near', slot: 1, hp: 71, status: 'par' },
    ])
  })

  it('withdraws no fainted Pokémon (X3)', () => {
    expect(sceneOf('|faint|p2a: Tyranitar', skarmory).map(plain)).toEqual([
      { op: 'faint', side: 'far' },
      'The opposing Tyranitar fainted!',
      'Bob sent out Skarmory!',
      { op: 'switchIn', side: 'far', slot: 1, hp: 100, status: 'none' },
    ])
  })

  it('drags a Pokémon in with no words of its trainer (X4)', () => {
    expect(sceneOf('|drag|p2a: Skarmory|Skarmory, F|100/100').map(plain)).toEqual([
      { op: 'withdraw', side: 'far' },
      { op: 'switchIn', side: 'far', slot: 1, hp: 100, status: 'none' },
      'The opposing Skarmory was dragged out!',
    ])
  })

  it('passes the baton with no "come back"', () => {
    const scene = sceneOf('|switch|p1a: Zapdos|Zapdos|100/100|[from] Baton Pass')
    expect(scene.map(plain)).toEqual([
      { op: 'withdraw', side: 'near' },
      'Go! Zapdos!',
      { op: 'switchIn', side: 'near', slot: 1, hp: 100, status: 'none' },
    ])
  })

  it('scales the exact HP of a custom game onto 100 (#41)', () => {
    const scene = sceneOf(
      '|switch|p1a: Metagross|Metagross|319/319',
      '|-damage|p1a: Metagross|160/319',
    )
    expect(scene).toContainEqual({ op: 'switchIn', side: 'near', slot: 1, hp: 100, status: 'none' })
    expect(scene).toContainEqual({ op: 'hp', side: 'near', hp: 50 })
  })
})

describe('faints', () => {
  it('faints the near Pokémon by its name', () => {
    expect(sceneOf('|faint|p1a: Dugtrio').map(plain)).toEqual([
      { op: 'faint', side: 'near' },
      'Dugtrio fainted!',
    ])
  })

  it('refuses a faint of a Pokémon that is not active', () => {
    expect(() => sceneOf('|faint|p2a: Tyranitar', '|faint|p2a: Tyranitar')).toThrow(Gen3Error)
    expect(() => sceneOf('|faint|p2a: Tyranitar', '|faint|p2a: Tyranitar')).toThrow(/not active/)
  })
})
