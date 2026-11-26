import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, popUp, sceneOf, streamOfLog } from '../testing'

describe('ability pop-ups', () => {
  it('sends the leads out, then raises and plays Sand Stream inside its pop-up (X10)', () => {
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
      { op: 'anim', side: 'near', anim: 'sandstormContinues' },
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

  // Own Tempo: `BattleScript_OwnTempoPrevents` runs before `attackanimation`, and Swagger's
  // `BattleScript_SwaggerOwnTempoPrevents` after the animation and the raise (#37).
  it('shows Own Tempo stopping confusion in place of a Confuse Ray', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Confuse Ray|p2a: Tyranitar',
      '|-immune|p2a: Tyranitar|confusion|[from] ability: Own Tempo',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Confuse Ray!',
      popUp('far', 'Own Tempo', true),
      'The opposing Tyranitar cannot be confused!',
      popUp('far', 'Own Tempo', false),
    ])
  })

  it('shows Own Tempo stopping confusion after a Swagger raised the stat', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Swagger|p2a: Tyranitar',
      '|-boost|p2a: Tyranitar|atk|2',
      '|-immune|p2a: Tyranitar|confusion|[from] ability: Own Tempo',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Swagger!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Swagger').number, animTurn: 0 },
      { op: 'stat', side: 'far', stat: 'atk', stages: 2, arrows: 'one' },
      "The opposing Tyranitar's Attack rose sharply!",
      popUp('far', 'Own Tempo', true),
      'The opposing Tyranitar cannot be confused!',
      popUp('far', 'Own Tempo', false),
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

// The expansion's `BattleScript_SwitchInAbilityMsg` with B_MSG_SWITCHIN_NEUTRALIZING_GAS, and
// `BattleScript_NeutralizingGasExits`, which prints its line with no pop-up.
describe('Neutralizing Gas', () => {
  it("fills the area inside its pop-up and wears off in the game's words", () => {
    const result = streamOfLog(
      '|-ability|p1a: Dugtrio|Neutralizing Gas',
      '|-end|p1a: Dugtrio|ability: Neutralizing Gas',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      popUp('near', 'Neutralizing Gas', true),
      'Neutralizing gas filled the area!',
      popUp('near', 'Neutralizing Gas', false),
      'The effects of the neutralizing gas wore off!',
      { op: 'end', outcome: 'unknown' },
    ])
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })
})
