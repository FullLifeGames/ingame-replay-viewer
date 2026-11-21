import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, sceneOf, streamOfLog } from '../testing'

const any = expect.any(Number) as number
const substitute = (on: boolean) => ({ op: 'volatile', side: 'near', volatile: 'substitute', on })

describe('Substitute (X12)', () => {
  it('starts, takes a hit and fades in the order of the expansion', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Substitute|p1a: Dugtrio',
      '|-start|p1a: Dugtrio|Substitute',
      '|-damage|p1a: Dugtrio|75/100',
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|Substitute|[damage]',
      '|move|p2a: Tyranitar|Earthquake|p1a: Dugtrio',
      '|-crit|p1a: Dugtrio',
      '|-supereffective|p1a: Dugtrio',
      '|-end|p1a: Dugtrio|Substitute',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Substitute!',
      { op: 'move', user: 'near', target: 'near', move: any },
      substitute(true),
      'Dugtrio put in a substitute!',
      { op: 'hp', side: 'near', hp: 75 },
      'The opposing Tyranitar used Rock Slide!',
      { op: 'move', user: 'far', target: 'near', move: any },
      { op: 'hit', side: 'near', effectiveness: 'normal' },
      'The substitute took damage for Dugtrio!',
      'The opposing Tyranitar used Earthquake!',
      { op: 'move', user: 'far', target: 'near', move: any },
      { op: 'hit', side: 'near', effectiveness: 'super' },
      'The substitute took damage for Dugtrio!',
      { op: 'anim', side: 'near', anim: 'substituteFade' },
      "Dugtrio's substitute faded!",
      substitute(false),
      'A critical hit!',
      "It's super effective!",
    ])
  })

  it('goes without a word when the log ends it silently', () => {
    const scene = sceneOf(
      '|-start|p1a: Dugtrio|Substitute',
      '|-end|p1a: Dugtrio|Substitute|[silent]',
    )
    expect(scene.slice(-1)).toEqual([substitute(false)])
  })
})

describe('other effects on one Pokémon', () => {
  it('says the effects that start, act and end with their lines', () => {
    const scene = sceneOf(
      '|-start|p2a: Tyranitar|move: Leech Seed',
      '|-start|p1a: Dugtrio|perish2',
      '|-activate|p1a: Dugtrio|confusion',
      '|-activate||move: Splash',
      '|-end|p2a: Tyranitar|move: Leech Seed',
    )
    expect(scene.map(plain)).toEqual([
      'The opposing Tyranitar was seeded!',
      "Dugtrio's perish count fell to 2!",
      'Dugtrio is confused!',
      'But nothing happened!',
      'The opposing Tyranitar was freed from Leech Seed!',
    ])
  })

  it('plays the focus of Focus Punch before its line, and says Protect for the turn', () => {
    const scene = sceneOf(
      '|-singleturn|p1a: Dugtrio|move: Focus Punch',
      '|-singleturn|p2a: Tyranitar|Protect',
      '|-activate|p2a: Tyranitar|Protect',
    )
    expect(scene.map(plain)).toEqual([
      { op: 'anim', side: 'near', anim: 'focusPunchSetup' },
      'Dugtrio is tightening its focus!',
      'The opposing Tyranitar protected itself!',
      'The opposing Tyranitar protected itself!',
    ])
  })

  it('makes an effect with no phrase a line of ours and a fallback (X14)', () => {
    const result = streamOfLog(
      '|-start|p1a: Dugtrio|Mystery Fog',
      '|-activate|p1a: Dugtrio|Mystery Fog',
      '|-end|p1a: Dugtrio|Mystery Fog',
      '|-singleturn|p1a: Dugtrio|Mystery Fog',
      '|-activate|p2a: Tyranitar|Mystery Wall',
    )
    const lines = result.instructions.filter(({ line }) => line >= NEXT)
    expect(lines.slice(0, -1).map(({ line, instruction }) => [line, plain(instruction)])).toEqual([
      [NEXT, 'Dugtrio is under Mystery Fog!'],
      [NEXT + 1, 'Dugtrio used Mystery Fog!'],
      [NEXT + 2, "Dugtrio's Mystery Fog wore off!"],
      [NEXT + 3, 'Dugtrio is ready with Mystery Fog!'],
      [NEXT + 4, 'The opposing Tyranitar used Mystery Wall!'],
    ])
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([
      [NEXT, 'phrase'],
      [NEXT + 1, 'phrase'],
      [NEXT + 2, 'phrase'],
      [NEXT + 3, 'phrase'],
      [NEXT + 4, 'phrase'],
    ])
  })

  it('lists a silent effect the stream holds no state for as a mechanic fallback', () => {
    const result = streamOfLog(
      '|-start|p1a: Dugtrio|perish3|[silent]',
      '|-end|p1a: Dugtrio|perish3|[silent]',
    )
    expect(result.instructions.filter(({ line }) => line >= NEXT).length).toBe(1)
    expect(result.fallbacks).toEqual([
      { line: NEXT, kind: 'mechanic', detail: 'no state in the stream for perish3 starting' },
      { line: NEXT + 1, kind: 'mechanic', detail: 'no state in the stream for perish3 ending' },
    ])
  })
})
