import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

const any = expect.any(Number) as number
const fallbacksOf = (...lines: string[]) =>
  streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)
const substitute = (on: boolean) => ({ op: 'volatile', side: 'near', volatile: 'substitute', on })

describe('Substitute (X12)', () => {
  it('starts, pays its HP before its line, takes a hit and fades in the order of the expansion', () => {
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
      { op: 'move', user: 'near', target: 'near', move: any, animTurn: 0 },
      substitute(true),
      { op: 'hp', side: 'near', hp: 75 },
      'Dugtrio put in a substitute!',
      'The opposing Tyranitar used Rock Slide!',
      { op: 'move', user: 'far', target: 'near', move: any, animTurn: 0 },
      { op: 'hit', side: 'near', effectiveness: 'normal' },
      'The substitute took damage for Dugtrio!',
      'The opposing Tyranitar used Earthquake!',
      { op: 'move', user: 'far', target: 'near', move: any, animTurn: 0 },
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

describe('Substitute without its usual lines', () => {
  it('sets a silent substitute alone, and plays a plain hit that breaks it as one', () => {
    const scene = sceneOf(
      '|-start|p1a: Dugtrio|Substitute|[silent]',
      '|-end|p1a: Dugtrio|Substitute',
    )
    expect(scene.map(plain)).toEqual([
      substitute(true),
      { op: 'hit', side: 'near', effectiveness: 'normal' },
      'The substitute took damage for Dugtrio!',
      { op: 'anim', side: 'near', anim: 'substituteFade' },
      "Dugtrio's substitute faded!",
      substitute(false),
    ])
  })
})

describe('other effects on one Pokémon', () => {
  it("names Curse's user from the log's source", () => {
    expect(sceneOf('|-start|p2a: Tyranitar|Curse|[of] p1a: Dugtrio').map(plain)).toEqual([
      'Dugtrio cut its own HP and put a curse on the opposing Tyranitar!',
    ])
  })

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

describe('a Pokémon that faints by its effect drains its bar first (#39)', () => {
  const destinyBond = [
    '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
    '|-damage|p2a: Tyranitar|0 fnt',
    '|-activate|p2a: Tyranitar|move: Destiny Bond',
    '|faint|p2a: Tyranitar',
    '|faint|p1a: Dugtrio',
  ]

  it('says Destiny Bond took the attacker down after the holder faints, then drains it', () => {
    expect(sceneOf(...destinyBond).map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      { op: 'move', user: 'near', target: 'far', move: any, animTurn: 0 },
      { op: 'hit', side: 'far', effectiveness: 'normal' },
      { op: 'hp', side: 'far', hp: 0 },
      { op: 'faint', side: 'far' },
      'The opposing Tyranitar fainted!',
      'The opposing Tyranitar took its attacker down with it!',
      { op: 'hp', side: 'near', hp: 0 },
      { op: 'faint', side: 'near' },
      'Dugtrio fainted!',
    ])
    expect(fallbacksOf(...destinyBond)).toEqual([])
  })

  it.each([
    ['in the turn', ['|turn|2', '|faint|p1a: Dugtrio']],
    ['in the log', ['|faint|p2a: Tyranitar']],
  ])('says Destiny Bond at once when no faint of its attacker follows %s', (_, after) => {
    const scene = sceneOf('|-activate|p2a: Tyranitar|move: Destiny Bond', ...after)
    expect(scene.map(plain)[0]).toBe('The opposing Tyranitar took its attacker down with it!')
    expect(scene).not.toContainEqual(expect.objectContaining({ op: 'hp' }))
  })

  it('drains each bar after its perish count reaches 0, before the faints', () => {
    const scene = sceneOf(
      '|-start|p1a: Dugtrio|perish0',
      '|-start|p2a: Tyranitar|perish0',
      '|faint|p1a: Dugtrio',
      '|faint|p2a: Tyranitar',
    )
    expect(scene.map(plain)).toEqual([
      "Dugtrio's perish count fell to 0!",
      { op: 'hp', side: 'near', hp: 0 },
      "The opposing Tyranitar's perish count fell to 0!",
      { op: 'hp', side: 'far', hp: 0 },
      { op: 'faint', side: 'near' },
      'Dugtrio fainted!',
      { op: 'faint', side: 'far' },
      'The opposing Tyranitar fainted!',
    ])
  })

  it('drains no bar for a count above 0', () => {
    expect(sceneOf('|-start|p1a: Dugtrio|perish1')).not.toContainEqual(
      expect.objectContaining({ op: 'hp' }),
    )
  })
})

describe('Psych Up', () => {
  it("says the user copied the target's stat changes after the animation", () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Psych Up|p2a: Tyranitar',
      '|-copyboost|p1a: Dugtrio|p2a: Tyranitar|[from] move: Psych Up',
    )
    expect(scene.map(plain).slice(1)).toEqual([
      { op: 'move', user: 'near', target: 'far', move: moveOf('Psych Up').number, animTurn: 0 },
      "Dugtrio copied the opposing Tyranitar's stat changes!",
    ])
  })
})

describe('the effects that last until the next move', () => {
  it('says Destiny Bond and Grudge as the game does', () => {
    const scene = sceneOf(
      '|-singlemove|p1a: Dugtrio|Destiny Bond',
      '|-singlemove|p2a: Tyranitar|Grudge',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio is hoping to take its attacker down with it!',
      'The opposing Tyranitar wants its target to bear a grudge!',
    ])
  })

  it('says nothing for Rage as it starts, as the game says nothing then', () => {
    const lines = ['|move|p2a: Tyranitar|Rage|p1a: Dugtrio', '|-singlemove|p2a: Tyranitar|Rage']
    expect(
      sceneOf(...lines)
        .map(plain)
        .slice(0, 1),
    ).toEqual(['The opposing Tyranitar used Rage!'])
    expect(sceneOf(...lines)).toHaveLength(2)
    expect(fallbacksOf(...lines)).toEqual([])
  })

  it('lists an effect the game has no line for', () => {
    expect(fallbacksOf('|-singlemove|p1a: Dugtrio|Glaive Rush')).toEqual([
      expect.objectContaining({ kind: 'phrase' }),
    ])
  })
})

describe('a future attack whose user has fainted (U4)', () => {
  const start = [
    '|move|p1a: Dugtrio|Future Sight|p2a: Tyranitar',
    '|-start|p1a: Dugtrio|Future Sight',
  ]
  const hit = ['|-end|p2a: Tyranitar|move: Future Sight', '|-damage|p2a: Tyranitar|50/100']

  it("lists the hit's animation, which the game plays from the empty side, as a mechanic", () => {
    const ko = ['|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio', '|-damage|p1a: Dugtrio|0 fnt']
    expect(fallbacksOf(...start, ...ko, '|faint|p1a: Dugtrio', ...hit)).toEqual([
      {
        line: NEXT + 5,
        kind: 'mechanic',
        detail: 'no state in the stream for Future Sight hitting from a side with no Pokémon out',
      },
    ])
  })

  it('lists nothing while its user is out', () => {
    expect(fallbacksOf(...start, ...hit)).toEqual([])
  })
})
