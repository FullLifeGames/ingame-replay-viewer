import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { abilityOf, moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

const popUp = (name: string, show: boolean) => ({
  op: 'ability',
  side: 'far',
  ability: abilityOf(name).number,
  show,
})

describe('weather', () => {
  it('sets the weather a move starts, then says it', () => {
    const scene = sceneOf('|move|p1a: Dugtrio|Rain Dance|p1a: Dugtrio', '|-weather|RainDance')
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Rain Dance!',
      { op: 'move', user: 'near', target: 'near', move: moveOf('Rain Dance').number, animTurn: 0 },
      { op: 'weather', weather: 'rain' },
      'It started to rain!',
    ])
  })

  it('plays the rain Drizzle starts after its line, inside the pop-up', () => {
    const scene = sceneOf('|-weather|RainDance|[from] ability: Drizzle|[of] p2a: Tyranitar')
    expect(scene.map(plain)).toEqual([
      popUp('Drizzle', true),
      { op: 'weather', weather: 'rain' },
      'It started to rain!',
      { op: 'anim', side: 'near', anim: 'rainContinues' },
      popUp('Drizzle', false),
    ])
  })

  it('plays the sunlight Drought starts after its line, inside the pop-up', () => {
    const scene = sceneOf('|-weather|SunnyDay|[from] ability: Drought|[of] p2a: Tyranitar')
    expect(scene.map(plain)).toEqual([
      popUp('Drought', true),
      { op: 'weather', weather: 'sun' },
      'The sunlight turned harsh!',
      { op: 'anim', side: 'near', anim: 'sunContinues' },
      popUp('Drought', false),
    ])
  })

  it('plays no animation for a weather the game lacks, even from an ability', () => {
    const scene = sceneOf('|-weather|Snow|[from] ability: Snow Warning|[of] p2a: Tyranitar')
    expect(scene.map(({ op }) => op)).toEqual(['ability', 'print', 'ability'])
  })

  it('says the sandstorm rages, plays it, then hurts with it (X10)', () => {
    const scene = sceneOf(
      '|-weather|Sandstorm',
      '|-weather|Sandstorm|[upkeep]',
      '|-damage|p1a: Dugtrio|94/100|[from] Sandstorm',
    )
    expect(scene.slice(2).map(plain)).toEqual([
      'The sandstorm is raging.',
      { op: 'anim', side: 'near', anim: 'sandstormContinues' },
      'Dugtrio is buffeted by the sandstorm!',
      { op: 'hit', side: 'near', effectiveness: 'normal' },
      { op: 'hp', side: 'near', hp: 94 },
    ])
  })

  it('plays the weather of the turn on the far side while the near slot is empty', () => {
    const scene = sceneOf(
      '|-weather|RainDance',
      '|faint|p1a: Dugtrio',
      '|-weather|RainDance|[upkeep]',
    )
    expect(scene.slice(-2).map(plain)).toEqual([
      'Rain continues to fall.',
      { op: 'anim', side: 'far', anim: 'rainContinues' },
    ])
  })

  it('clears the weather as it ends, then says so', () => {
    const scene = sceneOf('|-weather|SunnyDay', '|-weather|none')
    expect(scene.slice(2).map(plain)).toEqual([
      { op: 'weather', weather: 'none' },
      'The sunlight faded.',
    ])
  })

  it('says a weather the game lacks with a line of ours and lists it', () => {
    const result = streamOfLog('|-weather|Snow', '|-weather|Snow|[upkeep]')
    expect(result.instructions.filter(({ line }) => line >= NEXT).map(({ line }) => line)).toEqual([
      NEXT,
      NEXT + 1,
      NEXT + 1,
    ])
    expect(result.fallbacks.map(({ kind }) => kind)).toEqual(['phrase', 'phrase'])
  })
})

describe('sides and the field', () => {
  it('says the conditions set on a side and gone from it', () => {
    const scene = sceneOf(
      '|-sidestart|p2: Bob|Spikes',
      '|-sideend|p2: Bob|Spikes|[from] move: Rapid Spin|[of] p2a: Tyranitar',
      '|-sidestart|p1: Alice|Reflect',
      '|-sideend|p1: Alice|Reflect',
    )
    expect(scene.map(plain)).toEqual([
      'Spikes were scattered on the ground all around the opposing side!',
      'The opposing Tyranitar blew away Spikes!',
      'Reflect made your side stronger against physical moves!',
      "Your side's Reflect wore off!",
    ])
  })

  // Showdown's Gen 3 Mist is a side condition (`data/moves.ts` `mist`); the game says
  // gText_PkmnShroudedInMist with the user as B_ATK (`BattleScript_EffectMist`).
  it("says Mist's start on a side by its user, as the game does", () => {
    const lines = ['|move|p2a: Tyranitar|Mist|p2a: Tyranitar', '|-sidestart|p2: Bob|Mist']
    expect(sceneOf(...lines).map(plain)[2]).toBe(
      'The opposing Tyranitar surrounds itself with a protective mist!',
    )
    expect(streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  it('says Perish Song for the whole field', () => {
    expect(sceneOf('|-fieldactivate|move: Perish Song').map(plain)).toEqual([
      'All Pokémon that heard the song will faint in three turns!',
    ])
  })
})

// Showdown's Gen 3 rules log the sports as `-start` lines (`@pkmn/sim` `data/mods/gen5/moves.js`);
// the game says `gSportsUsedStringIds` after the animation (`BattleScript_EffectMudSport`).
describe('Mud Sport and Water Sport', () => {
  it('says that electricity or fire was weakened, with no line of ours', () => {
    const mud = streamOfLog('|-start|p1a: Dugtrio|Mud Sport')
    const water = streamOfLog('|-start|p2a: Tyranitar|move: Water Sport')
    const textOf = (result: typeof mud) =>
      result.instructions
        .filter(({ line }) => line >= NEXT)
        .map(({ instruction }) => plain(instruction))
    expect(textOf(mud)).toEqual([
      "Electricity's power was weakened!",
      { op: 'end', outcome: 'unknown' },
    ])
    expect(textOf(water)).toEqual(["Fire's power was weakened!", { op: 'end', outcome: 'unknown' }])
    expect([...mud.fallbacks, ...water.fallbacks].filter(({ line }) => line >= NEXT)).toEqual([])
  })
})
