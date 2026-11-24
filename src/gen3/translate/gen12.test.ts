// The lines Gen 1 and Gen 2 replays add (#60), as the Gen 3 backend plays them.
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, sceneOf, streamOfLog } from '../testing'

const fallbacksOf = (...lines: string[]) =>
  streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)

describe('a miss without a target (Gen 1 and 2)', () => {
  const MISS = ['|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[miss]', '|-miss|p1a: Dugtrio']

  it("says the move's target avoided the attack", () => {
    expect(sceneOf(...MISS).map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      'The opposing Tyranitar avoided the attack!',
    ])
    expect(fallbacksOf(...MISS)).toEqual([])
  })

  it('keeps our line where no move with a target comes before it', () => {
    expect(sceneOf('|-miss|p1a: Dugtrio').map(plain)).toEqual(["Dugtrio's attack missed!"])
    expect(fallbacksOf('|-miss|p1a: Dugtrio')).toEqual([
      { line: NEXT, kind: 'phrase', detail: 'no game message for a miss without a target' },
    ])
  })
})

describe("Gen 1's Reflect and Light Screen, which last on their user", () => {
  it("say the side message of the user's side", () => {
    const lines = [
      '|move|p1a: Dugtrio|Reflect|p1a: Dugtrio',
      '|-start|p1a: Dugtrio|Reflect',
      '|move|p2a: Tyranitar|Light Screen|p2a: Tyranitar',
      '|-start|p2a: Tyranitar|Light Screen',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Reflect!',
      { op: 'move', user: 'near', target: 'near', move: expect.any(Number) as number, animTurn: 0 },
      'Reflect made your side stronger against physical moves!',
      'The opposing Tyranitar used Light Screen!',
      { op: 'move', user: 'far', target: 'far', move: expect.any(Number) as number, animTurn: 0 },
      'Light Screen made the opposing side stronger against special moves!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe('Belly Drum (Gen 2 and 3)', () => {
  it('cuts the HP, plays the arrows and says the maxed Attack, as the expansion does', () => {
    const lines = [
      '|move|p1a: Dugtrio|Belly Drum|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|50/100',
      '|-setboost|p1a: Dugtrio|atk|6|[from] move: Belly Drum',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Belly Drum!',
      { op: 'move', user: 'near', target: 'near', move: expect.any(Number) as number, animTurn: 0 },
      { op: 'hp', side: 'near', hp: 50 },
      { op: 'stat', side: 'near', stat: 'atk', stages: 6, arrows: 'one' },
      'Dugtrio cut its own HP and maximized its Attack!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe("Mean Look's trap", () => {
  it('says its target can no longer escape', () => {
    const lines = [
      '|move|p1a: Dugtrio|Mean Look|p2a: Tyranitar',
      '|-activate|p2a: Tyranitar|trapped',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Mean Look!',
      { op: 'move', user: 'near', target: 'far', move: expect.any(Number) as number, animTurn: 0 },
      'The opposing Tyranitar can no longer escape!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe("Pursuit's activation on a Pokémon that switches out (Gen 2 and 3)", () => {
  const pursuit = (target: string, user: string, hp: string) => [
    `|-activate|${target}|move: Pursuit`,
    `|move|${user}|Pursuit|${target}|[from] Pursuit`,
    `|-damage|${target}|${hp}`,
  ]
  const anyMove = expect.any(Number) as number

  it('calls the target back before the hit, and the switch after it says no more', () => {
    const lines = [
      ...pursuit('p2a: Tyranitar', 'p1a: Dugtrio', '80/100'),
      '|switch|p2a: Skarmory|Skarmory, F|100/100',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'Bob withdrew Tyranitar!',
      'Dugtrio used Pursuit!',
      { op: 'move', user: 'near', target: 'far', move: anyMove, animTurn: 0 },
      { op: 'hit', side: 'far', effectiveness: 'normal' },
      { op: 'hp', side: 'far', hp: 80 },
      { op: 'withdraw', side: 'far' },
      'Bob sent out Skarmory!',
      { op: 'switchIn', side: 'far', slot: 1, hp: 100, status: 'none' },
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })

  it('calls the near Pokémon back by its own line', () => {
    const lines = pursuit('p1a: Dugtrio', 'p2a: Tyranitar', '0 fnt')

    expect(
      sceneOf(...lines)
        .map(plain)
        .slice(0, 2),
    ).toEqual(['Dugtrio, come back!', 'The opposing Tyranitar used Pursuit!'])
  })

  it("leaves a later switch of the trainer's own choice its line", () => {
    const lines = [
      ...pursuit('p2a: Tyranitar', 'p1a: Dugtrio', '80/100'),
      '|switch|p2a: Skarmory|Skarmory, F|100/100',
      '|turn|2',
      '|switch|p2a: Tyranitar|Tyranitar, M|80/100',
      '|turn|3',
      '|switch|p2a: Skarmory|Skarmory, F|100/100',
    ]

    expect(
      sceneOf(...lines)
        .map(plain)
        .filter((step) => typeof step === 'string'),
    ).toEqual([
      'Bob withdrew Tyranitar!',
      'Dugtrio used Pursuit!',
      'Bob sent out Skarmory!',
      'Bob withdrew Skarmory!',
      'Bob sent out Tyranitar!',
      'Bob withdrew Tyranitar!',
      'Bob sent out Skarmory!',
    ])
  })
})

describe('Haze (Gen 1 to 3)', () => {
  it('says every stat change is gone and plays no stat animation, as the expansion does', () => {
    const lines = ['|move|p2a: Tyranitar|Haze|p2a: Tyranitar', '|-clearallboost']

    expect(sceneOf(...lines).map(plain)).toEqual([
      'The opposing Tyranitar used Haze!',
      { op: 'move', user: 'far', target: 'far', move: expect.any(Number) as number, animTurn: 0 },
      'All stat changes were eliminated!',
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })
})

describe('Disable (Gen 1 to 3)', () => {
  it('names the move it disabled, as the expansion does', () => {
    const lines = [
      '|move|p2a: Tyranitar|Disable|p1a: Dugtrio',
      '|-start|p1a: Dugtrio|Disable|Body Slam',
    ]

    expect(sceneOf(...lines).map(plain)).toEqual([
      'The opposing Tyranitar used Disable!',
      { op: 'move', user: 'far', target: 'near', move: expect.any(Number) as number, animTurn: 0 },
      "Dugtrio's Body Slam was disabled!",
    ])
    expect(fallbacksOf(...lines)).toEqual([])
  })

  it('lists the detail of any other effect, whose line does not use it', () => {
    expect(sceneOf('|-start|p1a: Dugtrio|confusion|Body Slam').map(plain)).toEqual([
      'Dugtrio became confused!',
    ])
    expect(fallbacksOf('|-start|p1a: Dugtrio|confusion|Body Slam')).toEqual([
      {
        line: NEXT,
        kind: 'phrase',
        detail: 'no game message for confusion starting with Body Slam',
      },
    ])
  })
})

describe('Transform (Gen 1 to 3)', () => {
  const lines = [
    '|move|p1a: Dugtrio|Transform|p2a: Tyranitar',
    '|-transform|p1a: Dugtrio|p2a: Tyranitar',
  ]

  it('says the species it turned into, as the expansion does', () => {
    expect(sceneOf(...lines).map(plain)).toEqual([
      'Dugtrio used Transform!',
      { op: 'move', user: 'near', target: 'far', move: expect.any(Number) as number, animTurn: 0 },
      'Dugtrio transformed into Tyranitar!',
    ])
  })

  it("names the species, not the target's nickname", () => {
    const named = [
      '|switch|p2a: Rocky|Tyranitar, M|100/100',
      '|move|p1a: Dugtrio|Transform|p2a: Rocky',
      '|-transform|p1a: Dugtrio|p2a: Rocky',
    ]

    expect(
      sceneOf(...named)
        .map(plain)
        .at(-1),
    ).toBe('Dugtrio transformed into Tyranitar!')
  })

  it("turns the sprite through the move's animation, so a plain target takes no fallback", () => {
    expect(fallbacksOf(...lines)).toEqual([])
  })

  it("names the shiny colours of a shiny target, which the game's copy lacks", () => {
    const shiny = [
      '|switch|p2a: Gleam|Tyranitar, shiny|100/100',
      '|move|p1a: Dugtrio|Transform|p2a: Gleam',
      '|-transform|p1a: Dugtrio|p2a: Gleam',
    ]

    expect(fallbacksOf(...shiny)).toEqual([
      {
        line: NEXT + 2,
        kind: 'mechanic',
        detail: "no state in the stream for Transform copying the target's shiny colours",
      },
    ])
  })
})

describe("Gen 1's partial trap, which keeps its target from moving", () => {
  it("keeps our line and names the scene the expansion's traps never make", () => {
    const line = '|cant|p1a: Dugtrio|partiallytrapped'

    expect(sceneOf(line).map(plain)).toEqual(["Dugtrio couldn't move!"])
    expect(fallbacksOf(line)).toEqual([
      {
        line: NEXT,
        kind: 'phrase',
        detail: 'no game message for a Pokémon a partial trap keeps from moving',
      },
    ])
  })
})
