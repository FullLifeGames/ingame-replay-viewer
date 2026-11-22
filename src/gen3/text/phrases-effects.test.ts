import { describe, expect, it } from 'vitest'

import { blocked, effectActivated, effectEnded, effectStarted, singleTurn } from './phrases-effects'
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
    expect(effectStarted(mon(event.who), event.effect, source)).toEqual({ text })
  })

  it('gives an effect without a message our wording and a fallback', () => {
    const { event, mon } = sceneOf('effectStart', '|-start|p2a: Tyranitar|Magnet Rise')
    expect(effectStarted(mon(event.who), event.effect, undefined)).toEqual({
      text: `The opposing Tyranitar is under Magnet${NBSP}Rise!`,
      fallback: { kind: 'phrase', detail: 'no game message for Magnet Rise starting' },
    })
  })

  it('gives a Curse without its user our wording', () => {
    const { event, mon } = sceneOf('effectStart', '|-start|p2a: Tyranitar|Curse')
    expect(effectStarted(mon(event.who), event.effect, undefined).fallback).toBeDefined()
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

describe('an effect for one turn, and a block (P1)', () => {
  it.each([
    ['p1a: Dugtrio|Protect', 'Dugtrio protected itself!'],
    ['p1a: Dugtrio|move: Endure', 'Dugtrio braced itself!'],
    ['p2a: Tyranitar|move: Focus Punch', 'The opposing Tyranitar is tightening its focus!'],
  ])('words %s', (rest, text) => {
    const { event, mon } = sceneOf('singleTurn', `|-singleturn|${rest}`)
    expect(singleTurn(mon(event.who), event.effect)).toEqual({ text })
  })

  it('gives a single-turn effect without a message our wording', () => {
    const { event, mon } = sceneOf('singleTurn', '|-singleturn|p1a: Dugtrio|move: Snatch')
    expect(singleTurn(mon(event.who), event.effect).fallback).toMatchObject({ kind: 'phrase' })
  })

  it('says Protect blocked a move, and gives other blocks our wording', () => {
    const { event, mon } = sceneOf('block', '|-block|p2a: Tyranitar|Protect')
    expect(blocked(mon(event.who), event.effect)).toEqual({
      text: 'The opposing Tyranitar protected itself!',
    })
    expect(blocked(mon(event.who), { name: 'Magic Coat', kind: 'move' })).toEqual({
      text: `The opposing Tyranitar was protected by Magic${NBSP}Coat!`,
      fallback: { kind: 'phrase', detail: 'no game message for a block by Magic Coat' },
    })
  })
})
