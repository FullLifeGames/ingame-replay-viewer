import { describe, expect, it } from 'vitest'

import {
  challenged,
  draggedOut,
  fieldActivated,
  sentOut,
  sideEnded,
  sideStarted,
  simulatorMessage,
  tie,
  weatherText,
  withdrawn,
  won,
} from './phrases-field'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

describe('intro and switches (P1)', () => {
  it('opens with the far player challenging you', () => {
    const { trainer } = sceneOf('turn', '|turn|1')
    expect(challenged(trainer('far'))).toBe('You are challenged by Bob!')
  })

  it('sends the far Pokémon out by its trainer and the near one with "Go!"', () => {
    const { event, mon, trainer } = sceneOf(
      'switchIn',
      '|switch|p2a: Skarmory|Skarmory, F|100/100',
      '|switch|p1a: Machine Passage|Zapdos|100/100',
    )
    expect(sentOut(mon(event.who), trainer(event.who.side))).toBe('Bob sent out Skarmory!')
    const near = { side: 'near', name: `Machine${NBSP}Passage` } as const
    expect(sentOut(near, trainer('near'))).toBe(`Go! Machine${NBSP}Passage!`)
  })

  it('withdraws the Pokémon a switch replaces, by side', () => {
    const { event, mon, trainer } = sceneOf('switchIn', '|switch|p2a: Skarmory|Skarmory|100/100')
    if (event.replaces === undefined) throw new Error('no replaced Pokémon')
    expect(withdrawn(mon(event.replaces), trainer('far'))).toBe('Bob withdrew Tyranitar!')
    const near = sceneOf('switchIn', '|switch|p1a: Zapdos|Zapdos|100/100')
    if (near.event.replaces === undefined) throw new Error('no replaced Pokémon')
    expect(withdrawn(near.mon(near.event.replaces), near.trainer('near'))).toBe(
      'Dugtrio, come back!',
    )
  })

  it('says a Pokémon was dragged out', () => {
    const { event, mon } = sceneOf('switchIn', '|drag|p2a: Skarmory|Skarmory|100/100')
    expect(event.dragged).toBe(true)
    expect(draggedOut(mon(event.who))).toBe('The opposing Skarmory was dragged out!')
  })
})

describe('weather (P1)', () => {
  it.each([
    ['|-weather|RainDance', 'It started to rain!'],
    [
      '|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar',
      'A sandstorm kicked up!',
    ],
    ['|-weather|SunnyDay', 'The sunlight turned harsh!'],
    ['|-weather|Hail', 'It started to hail!'],
    ['|-weather|RainDance\n|-weather|RainDance|[upkeep]', 'Rain continues to fall.'],
    ['|-weather|Sandstorm\n|-weather|Sandstorm|[upkeep]', 'The sandstorm is raging.'],
    ['|-weather|SunnyDay\n|-weather|SunnyDay|[upkeep]', 'The sunlight is strong.'],
    ['|-weather|Hail\n|-weather|Hail|[upkeep]', 'The hail is crashing down.'],
    ['|-weather|RainDance\n|-weather|none', 'The rain stopped.'],
    ['|-weather|Sandstorm\n|-weather|none', 'The sandstorm subsided.'],
    ['|-weather|SunnyDay\n|-weather|none', 'The sunlight faded.'],
    ['|-weather|Hail\n|-weather|none', 'The hail stopped.'],
    ['|-weather|Snowscape', 'It started to snow!'],
    ['|-weather|Snowscape\n|-weather|Snowscape|[upkeep]', 'Snow continues to fall.'],
    ['|-weather|Snowscape\n|-weather|none', 'The snow stopped.'],
  ])('words %j', (lines, text) => {
    const { last } = sceneOf('weather', ...lines.split('\n'))
    expect(weatherText(last.weather, last.phase)).toEqual({ text })
  })

  it('gives a weather without a Gen 3 message our wording and a fallback', () => {
    expect(weatherText('Heavy Rain', 'start')).toEqual({
      text: 'The weather changed to Heavy\u00a0Rain!',
      fallback: { kind: 'phrase', detail: 'no game message for Heavy Rain at its start' },
    })
  })
})

describe('sides and the field (P1)', () => {
  it.each([
    ['Spikes', 'Spikes were scattered on the ground all around the\u00a0opposing side!'],
    ['Reflect', 'Reflect made the\u00a0opposing side stronger against physical moves!'],
    [
      'move: Light Screen',
      'Light Screen made the\u00a0opposing side stronger against special moves!',
    ],
    ['Safeguard', 'The\u00a0opposing side became cloaked in a mystical veil!'],
    [
      'move: Aurora Veil',
      'Aurora Veil made the\u00a0opposing side stronger against physical and special moves!',
    ],
  ])('words %s starting on the far side', (condition, text) => {
    const { event } = sceneOf('sideStart', `|-sidestart|p2: Bob|${condition}`)
    expect(sideStarted(event.side, event.condition)).toEqual({ text })
  })

  it('words the near side as yours', () => {
    const { event } = sceneOf('sideStart', '|-sidestart|p1: Alice|Spikes')
    expect(sideStarted(event.side, event.condition).text).toBe(
      'Spikes were scattered on the ground all around your side!',
    )
  })

  it.each([
    ['Spikes|[from] move: Rapid Spin|[of] p1a: Dugtrio', 'Dugtrio blew away Spikes!'],
    ['Reflect', "The\u00a0opposing side's Reflect wore off!"],
    ['Light Screen', "The\u00a0opposing side's Light Screen wore off!"],
    ['Safeguard', 'The\u00a0opposing side is no longer protected by the mystical veil!'],
    ['move: Aurora Veil', "The\u00a0opposing side's Aurora\u00a0Veil wore off!"],
  ])('words %s ending', (condition, text) => {
    const { event, mon } = sceneOf('sideEnd', `|-sideend|p2: Bob|${condition}`)
    const source = event.source && mon(event.source)
    expect(sideEnded(event.side, event.condition, source, event.cause)).toEqual({ text })
  })

  it('words Stealth Rock set on a side, the way Spikes reads', () => {
    const near = sceneOf('sideStart', '|-sidestart|p1: Alice|move: Stealth Rock').event
    expect(sideStarted(near.side, near.condition)).toEqual({
      text: 'Pointed stones float in the air on your side!',
    })
    const far = sceneOf('sideStart', '|-sidestart|p2: Bob|move: Stealth Rock').event
    expect(sideStarted(far.side, far.condition)).toEqual({
      text: 'Pointed stones float in the air on the\u00a0opposing side!',
    })
  })

  it.each([
    [
      'Stealth Rock|[from] move: Rapid Spin|[of] p2a: Tyranitar',
      'The opposing Tyranitar blew away Stealth Rock!',
    ],
    ['Stealth Rock', 'The pointed stones disappeared from the\u00a0opposing side!'],
  ])('words %s ending with its source or without one (D3)', (condition, text) => {
    const { event, mon } = sceneOf('sideEnd', `|-sideend|p2: Bob|${condition}`)
    const source = event.source && mon(event.source)
    expect(sideEnded(event.side, event.condition, source, event.cause)).toEqual({ text })
  })

  it.each([
    ['p1: Alice', 'Toxic spikes were scattered on the ground all around your side!'],
    ['p2: Bob', 'Toxic spikes were scattered on the ground all around the\u00a0opposing side!'],
  ])('words Toxic Spikes set on %s (STRINGID_POISONSPIKESSCATTERED)', (side, text) => {
    const { event } = sceneOf('sideStart', `|-sidestart|${side}|move: Toxic Spikes`)
    expect(sideStarted(event.side, event.condition)).toEqual({ text })
  })

  it.each([
    [
      'absorbed by a Pokémon of the side (STRINGID_TOXICSPIKESABSORBED)',
      'move: Toxic Spikes|[of] p2a: Tyranitar',
      'The toxic spikes disappeared from the ground around the\u00a0opposing side!',
    ],
    [
      'blown away by Rapid Spin (STRINGID_PKMNBLEWAWAYTOXICSPIKES)',
      'move: Toxic Spikes|[from] move: Rapid Spin|[of] p2a: Tyranitar',
      'The opposing Tyranitar blew away Toxic Spikes!',
    ],
  ])('words Toxic Spikes %s', (_, condition, text) => {
    const { event, mon } = sceneOf('sideEnd', `|-sideend|p2: Bob|${condition}`)
    const source = event.source && mon(event.source)
    expect(sideEnded(event.side, event.condition, source, event.cause)).toEqual({ text })
  })

  it('keeps a fallback for Toxic Spikes ending with neither a cause nor a source', () => {
    const { event } = sceneOf('sideEnd', '|-sideend|p2: Bob|move: Toxic Spikes')
    expect(sideEnded(event.side, event.condition, undefined, undefined).fallback).toEqual({
      kind: 'phrase',
      detail: 'no game message for Toxic Spikes ending on a side',
    })
  })

  it('gives side conditions without a rule our wording and a fallback', () => {
    const started = sceneOf('sideStart', '|-sidestart|p2: Bob|move: Tailwind').event
    expect(sideStarted(started.side, started.condition).fallback).toMatchObject({ kind: 'phrase' })
    const ended = sceneOf('sideEnd', '|-sideend|p2: Bob|Spikes').event
    expect(sideEnded(ended.side, ended.condition, undefined, undefined)).toEqual({
      text: "The\u00a0opposing side's Spikes wore off!",
      fallback: { kind: 'phrase', detail: 'no game message for Spikes ending on a side' },
    })
  })

  it('words Perish Song on the field, and our wording for others', () => {
    const { event } = sceneOf('fieldActivate', '|-fieldactivate|move: Perish Song')
    expect(fieldActivated(event.effect)).toEqual({
      text: 'All Pokémon that heard the song will faint in three turns!',
    })
    expect(fieldActivated({ name: 'Gravity', kind: 'move' })).toEqual({
      text: 'Gravity took effect!',
      fallback: { kind: 'phrase', detail: 'no game message for Gravity on the field' },
    })
  })
})

describe('the end and the simulator (P1)', () => {
  it('names the winner and a tie in our wording', () => {
    const { event, trainer } = sceneOf('win', '|win|Alice')
    expect(won(trainer(event.side ?? 'near'))).toBe('Alice won the battle!')
    sceneOf('tie', '|tie')
    expect(tie()).toBe('The battle ended in a tie!')
  })

  it("passes the simulator's own lines through, fitted to the charset", () => {
    const { event } = sceneOf('message', '|-message|Bob forfeited.')
    expect(simulatorMessage(event.text)).toEqual({ text: 'Bob forfeited.' })
    expect(simulatorMessage('Bob 🏳 forfeited.').fallback).toMatchObject({ kind: 'character' })
  })
})
