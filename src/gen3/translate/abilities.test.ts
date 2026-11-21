import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { abilityOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

type Side = 'near' | 'far'

const popUp = (side: Side, name: string, show: boolean) => ({
  op: 'ability',
  side,
  ability: abilityOf(name).number,
  show,
})

describe('ability pop-ups', () => {
  it('sends the leads out, then raises Sand Stream with its pop-up (X10)', () => {
    const result = streamOfLog(
      '|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar',
    )
    const ops = result.instructions.map(({ instruction }) => instruction.op)
    expect(ops.slice(0, 6)).toEqual(['intro', 'print', 'print', 'sendOut', 'print', 'sendOut'])
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      popUp('far', 'Sand Stream', true),
      { op: 'weather', weather: 'sand' },
      'A sandstorm kicked up!',
      popUp('far', 'Sand Stream', false),
      { op: 'end', outcome: 'unknown' },
    ])
  })

  it('keeps Intimidate up over the drop it causes and the Clear Body that stops one', () => {
    const scene = sceneOf(
      '|-ability|p1a: Dugtrio|Intimidate|boost',
      '|-unboost|p2a: Tyranitar|atk|1',
      '|switch|p2a: Metagross|Metagross|100/100',
      '|-ability|p1a: Dugtrio|Intimidate|boost',
      '|-fail|p2a: Metagross|unboost|[from] ability: Clear Body|[of] p2a: Metagross',
    )
    expect(scene.map(plain)).toEqual([
      popUp('near', 'Intimidate', true),
      { op: 'stat', side: 'far', stat: 'atk', stages: -1, arrows: 'one' },
      "The opposing Tyranitar's Attack fell!",
      popUp('near', 'Intimidate', false),
      'Bob withdrew Tyranitar!',
      { op: 'withdraw', side: 'far' },
      'Bob sent out Metagross!',
      { op: 'switchIn', side: 'far', slot: 1, hp: 100, status: 'none' },
      popUp('near', 'Intimidate', true),
      popUp('far', 'Clear Body', true),
      "The opposing Metagross's stats were not lowered!",
      popUp('far', 'Clear Body', false),
      popUp('near', 'Intimidate', false),
    ])
  })

  // Intimidate on a Pokémon at -6 logs a drop of 0 (Charm at -6 does so in gen3ou-2717081342).
  it("keeps Intimidate up over a stat that won't go any lower", () => {
    const scene = sceneOf(
      '|-ability|p1a: Dugtrio|Intimidate|boost',
      '|-unboost|p2a: Tyranitar|atk|0',
    )
    expect(scene.map(plain)).toEqual([
      popUp('near', 'Intimidate', true),
      "The opposing Tyranitar's Attack won't go any lower!",
      popUp('near', 'Intimidate', false),
    ])
  })

  it('shows an ability with its line, or alone where the game has none', () => {
    const scene = sceneOf(
      '|-ability|p2a: Tyranitar|Pressure',
      '|-ability|p2a: Tyranitar|Sand Stream',
    )
    expect(scene.map(plain)).toEqual([
      popUp('far', 'Pressure', true),
      'The opposing Tyranitar is exerting its pressure!',
      popUp('far', 'Pressure', false),
      popUp('far', 'Sand Stream', true),
      popUp('far', 'Sand Stream', false),
    ])
  })

  it('wraps the damage, heals and immunities an ability causes in its pop-up', () => {
    const scene = sceneOf(
      '|-damage|p1a: Dugtrio|90/100|[from] ability: Rough Skin|[of] p2a: Tyranitar',
      '|-heal|p2a: Tyranitar|100/100|[from] ability: Volt Absorb|[of] p1a: Dugtrio',
      '|-immune|p1a: Dugtrio|[from] ability: Levitate',
    )
    expect(scene.map(plain)).toEqual([
      popUp('far', 'Rough Skin', true),
      { op: 'hp', side: 'near', hp: 90 },
      "Dugtrio was hurt by the opposing Tyranitar's Rough Skin!",
      popUp('far', 'Rough Skin', false),
      popUp('far', 'Volt Absorb', true),
      { op: 'hp', side: 'far', hp: 100 },
      'The opposing Tyranitar had its HP restored.',
      popUp('far', 'Volt Absorb', false),
      popUp('near', 'Levitate', true),
      "It doesn't affect Dugtrio…",
      popUp('near', 'Levitate', false),
    ])
  })

  it('shows Truant before the Pokémon loafs around', () => {
    expect(sceneOf('|cant|p2a: Tyranitar|ability: Truant').map(plain)).toEqual([
      popUp('far', 'Truant', true),
      'The opposing Tyranitar is loafing around!',
      popUp('far', 'Truant', false),
    ])
  })

  it('gives an ability the expansion lacks a line of text and no pop-up', () => {
    const result = streamOfLog(
      '|-ability|p2a: Tyranitar|Mountaineer',
      '|-damage|p1a: Dugtrio|90/100|[from] ability: Mountaineer|[of] p2a: Tyranitar',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      "The opposing Tyranitar's Mountaineer took effect!",
      { op: 'hp', side: 'near', hp: 90 },
      "Dugtrio was hurt by the opposing Tyranitar's Mountaineer!",
      { op: 'end', outcome: 'unknown' },
    ])
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([
      [NEXT, 'ability'],
      [NEXT + 1, 'ability'],
    ])
  })
})
