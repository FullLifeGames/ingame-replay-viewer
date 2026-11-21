import { describe, expect, it } from 'vitest'

import { abilityShown, itemRemoved, itemShown } from './phrases-items'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

describe('items (P1)', () => {
  it.each([
    [
      'p1a: Dugtrio|Leftovers|[from] move: Thief|[of] p2a: Tyranitar',
      "Dugtrio stole the opposing Tyranitar's Leftovers!",
    ],
    ['p1a: Dugtrio|Choice Band|[from] move: Trick', `Dugtrio obtained Choice${NBSP}Band.`],
  ])('words an item that changes hands: %s', (rest, text) => {
    const { event, mon } = sceneOf('item', `|-item|${rest}`)
    const source = event.source && mon(event.source)
    expect(itemShown(mon(event.who), event.item, event.cause, source)).toEqual({ text })
  })

  it('gives an item shown another way our wording and a fallback', () => {
    const { event, mon } = sceneOf(
      'item',
      '|-item|p2a: Tyranitar|Leftovers|[from] ability: Frisk|[of] p1a: Dugtrio',
    )
    const source = event.source && mon(event.source)
    expect(itemShown(mon(event.who), event.item, event.cause, source)).toEqual({
      text: "The opposing Tyranitar's Leftovers was revealed!",
      fallback: { kind: 'phrase', detail: 'no game message for an item shown by Frisk' },
    })
  })

  it('gives an item shown with no cause our wording too', () => {
    const { event, mon } = sceneOf('item', '|-item|p1a: Dugtrio|Leftovers')
    expect(itemShown(mon(event.who), event.item, event.cause, undefined).fallback).toEqual({
      kind: 'phrase',
      detail: 'no game message for an item shown',
    })
  })

  it('says Knock Off knocked an item off', () => {
    const { event, mon } = sceneOf(
      'itemEnd',
      '|-enditem|p2a: Tyranitar|Leftovers|[from] move: Knock Off|[of] p1a: Dugtrio',
    )
    const source = event.source && mon(event.source)
    expect(itemRemoved(mon(event.who), event.item, event.cause, source)).toEqual({
      text: "Dugtrio knocked off the opposing Tyranitar's Leftovers!",
    })
  })

  it('gives an item used up another way our wording and a fallback', () => {
    const { event, mon } = sceneOf('itemEnd', '|-enditem|p1a: Dugtrio|White Herb')
    expect(itemRemoved(mon(event.who), event.item, event.cause, undefined)).toEqual({
      text: `Dugtrio's White${NBSP}Herb was used up!`,
      fallback: { kind: 'phrase', detail: 'no game message for White Herb used up' },
    })
  })
})

describe('abilities (P1)', () => {
  it('says Pressure is exerted', () => {
    const { event, mon } = sceneOf('ability', '|-ability|p2a: Tyranitar|Pressure')
    expect(abilityShown(mon(event.who), event.ability)).toBe(
      'The opposing Tyranitar is exerting its pressure!',
    )
  })

  it('leaves the pop-up alone to show an ability with no line of its own', () => {
    const { event, mon } = sceneOf('ability', '|-ability|p2a: Tyranitar|Intimidate|boost')
    expect(abilityShown(mon(event.who), event.ability)).toBeUndefined()
  })
})
