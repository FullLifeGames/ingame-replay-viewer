import { describe, expect, it } from 'vitest'

import { effectActivated, effectEnded, effectStarted } from './phrases-effects'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

describe('an effect that starts (P1)', () => {
  it.each([
    ['p1a: Dugtrio|Substitute', 'Dugtrio put in a substitute!'],
    ['p2a: Tyranitar|move: Leech Seed', 'The opposing Tyranitar was seeded!'],
    ['p1a: Dugtrio|perish3', "Dugtrio's perish count fell to 3!"],
    ['p1a: Dugtrio|perish0', "Dugtrio's perish count fell to 0!"],
    ['p1a: Dugtrio|confusion', 'Dugtrio became confused!'],
    ['p1a: Dugtrio|move: Focus Energy', 'Dugtrio is getting pumped!'],
    ['p2a: Tyranitar|move: Taunt', 'The opposing Tyranitar fell for the taunt!'],
    ['p2a: Tyranitar|Encore', 'The opposing Tyranitar must do an encore!'],
    ['p2a: Tyranitar|Attract', 'The opposing Tyranitar fell in love!'],
    ['p2a: Tyranitar|move: Yawn|[of] p1a: Dugtrio', 'The opposing Tyranitar grew drowsy!'],
    ['p2a: Tyranitar|Nightmare', 'The opposing Tyranitar began having a nightmare!'],
    [
      'p2a: Tyranitar|Curse|[of] p1a: Dugtrio',
      'Dugtrio cut its own HP and put a curse on the opposing Tyranitar!',
    ],
  ])('words %s', (rest, text) => {
    const { event, mon } = sceneOf('effectStart', `|-start|${rest}`)
    const source = event.source && mon(event.source)
    expect(effectStarted(mon(event.who), event.effect, { source })).toEqual({ text })
  })

  it('gives an effect without a message our wording and a fallback', () => {
    const { event, mon } = sceneOf('effectStart', '|-start|p2a: Tyranitar|Magnet Rise')
    expect(effectStarted(mon(event.who), event.effect)).toEqual({
      text: `The opposing Tyranitar is under Magnet${NBSP}Rise!`,
      fallback: { kind: 'phrase', detail: 'no game message for Magnet Rise starting' },
    })
  })

  it('words a type change with the type the line names (#88)', () => {
    const line = '|-start|p2a: Tyranitar|typechange|Ice|[from] ability: Protean'
    const { event, mon } = sceneOf('effectStart', line)
    expect(
      effectStarted(mon(event.who), event.effect, { cause: event.cause, detail: event.detail }),
    ).toEqual({
      text: 'The opposing Tyranitar transformed into the Ice type!',
    })
  })

  it('gives a Curse without its user our wording', () => {
    const { event, mon } = sceneOf('effectStart', '|-start|p2a: Tyranitar|Curse')
    expect(effectStarted(mon(event.who), event.effect).fallback).toBeDefined()
  })
})

describe('a partial trap that starts (P1, `gWrappedStringIds`)', () => {
  const TRAPPED = {
    Bind: [
      'The opposing Tyranitar was squeezed by Dugtrio!',
      'Dugtrio was squeezed by the opposing Tyranitar!',
    ],
    Wrap: [
      'The opposing Tyranitar was wrapped by Dugtrio!',
      'Dugtrio was wrapped by the opposing Tyranitar!',
    ],
    'Fire Spin': [
      'The opposing Tyranitar became trapped in the vortex!',
      'Dugtrio became trapped in the vortex!',
    ],
    Whirlpool: [
      'The opposing Tyranitar became trapped in the vortex!',
      'Dugtrio became trapped in the vortex!',
    ],
    Clamp: [
      'Dugtrio clamped down on the opposing Tyranitar!',
      'The opposing Tyranitar clamped down on Dugtrio!',
    ],
    'Sand Tomb': [
      'The opposing Tyranitar became trapped by the quicksand!',
      'Dugtrio became trapped by the quicksand!',
    ],
  }
  const scenes = Object.entries(TRAPPED).flatMap(([move, [onFar = '', onNear = '']]) => [
    [move, 'p2a: Tyranitar', 'p1a: Dugtrio', onFar],
    [move, 'p1a: Dugtrio', 'p2a: Tyranitar', onNear],
  ])

  it.each(scenes)('words %s on %s by %s', (move, target, trapper, text) => {
    const { event, mon } = sceneOf('effectStart', `|-start|${target}|move: ${move}|[of] ${trapper}`)
    const source = event.source && mon(event.source)
    expect(effectStarted(mon(event.who), event.effect, { source })).toEqual({ text })
  })

  it('gives a trap that names no trapper our wording and a fallback', () => {
    const { event, mon } = sceneOf('effectStart', '|-start|p2a: Tyranitar|move: Wrap')
    expect(effectStarted(mon(event.who), event.effect).fallback).toBeDefined()
  })
})

describe('an effect that acts (P1)', () => {
  it.each([
    [
      'p2a: Tyranitar|Substitute|[damage]',
      'The substitute took damage for the opposing Tyranitar!',
    ],
    ['|move: Splash', 'But nothing happened!'],
    ['p1a: Dugtrio|confusion', 'Dugtrio is confused!'],
    ['p2a: Tyranitar|move: Destiny Bond', 'The opposing Tyranitar took its attacker down with it!'],
    ['p1a: Dugtrio|move: Trick|[of] p2a: Tyranitar', 'Dugtrio switched items with its target!'],
    [
      'p1a: Dugtrio|move: Switcheroo|[of] p2a: Tyranitar',
      'Dugtrio switched items with its target!',
    ],
  ])('words %s', (rest, text) => {
    const { event, mon } = sceneOf('effectActivate', `|-activate|${rest}`)
    expect(effectActivated(event.who && mon(event.who), event.effect)).toEqual({ text })
  })

  it('gives an effect without a message our wording and a fallback', () => {
    const { event, mon } = sceneOf('effectActivate', '|-activate|p1a: Dugtrio|move: Mimic')
    expect(effectActivated(event.who && mon(event.who), event.effect)).toEqual({
      text: 'Dugtrio used Mimic!',
      fallback: { kind: 'phrase', detail: 'no game message for Mimic acting' },
    })
    expect(effectActivated(undefined, event.effect)).toEqual({
      text: 'Mimic took effect!',
      fallback: { kind: 'phrase', detail: 'no game message for Mimic acting' },
    })
  })
})

describe('an effect that ends (P1)', () => {
  it.each([
    ['p2a: Tyranitar|Substitute', "The opposing Tyranitar's substitute faded!"],
    ['p1a: Dugtrio|confusion', 'Dugtrio snapped out of its confusion!'],
    ['p1a: Dugtrio|move: Leech Seed|[from] move: Rapid Spin', 'Dugtrio was freed from Leech Seed!'],
    ['p1a: Dugtrio|Encore', 'Dugtrio ended its encore!'],
    ['p1a: Dugtrio|Disable', "Dugtrio's move is no longer disabled!"],
    ['p1a: Dugtrio|move: Fire Spin', `Dugtrio was freed from Fire${NBSP}Spin!`],
  ])('words %s', (rest, text) => {
    const { event, mon } = sceneOf('effectEnd', `|-end|${rest}`)
    expect(effectEnded(mon(event.who), event.effect)).toEqual({ text })
  })

  it('gives an effect without a message our wording and a fallback', () => {
    const { event, mon } = sceneOf('effectEnd', '|-end|p1a: Dugtrio|move: Taunt')
    expect(effectEnded(mon(event.who), event.effect)).toEqual({
      text: "Dugtrio's Taunt wore off!",
      fallback: { kind: 'phrase', detail: 'no game message for Taunt ending' },
    })
  })
})
