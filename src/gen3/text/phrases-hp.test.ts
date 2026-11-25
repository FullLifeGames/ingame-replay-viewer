import { describe, expect, it } from 'vitest'

import { healed, hpSet, hurt, wishCameTrue } from './phrases-hp'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

const damage = (from: string) => sceneOf('damage', `|-damage|p1a: Dugtrio|60/100|[from] ${from}`)

describe('damage from a cause (P1)', () => {
  it.each([
    ['Sandstorm', 'Dugtrio is buffeted by the sandstorm!'],
    ['Hail', 'Dugtrio is buffeted by the hail!'],
    ['Spikes', 'Dugtrio was hurt by the spikes!'],
    ['Stealth Rock', 'Pointed stones dug into Dugtrio!'],
    ['psn', 'Dugtrio was hurt by its poisoning!'],
    ['brn', 'Dugtrio was hurt by its burn!'],
    ['Recoil|[of] p2a: Tyranitar', 'Dugtrio was damaged by the recoil!'],
    ['Leech Seed|[of] p2a: Tyranitar', "Dugtrio's health is sapped by Leech Seed!"],
    ['confusion', 'It hurt itself in its confusion!'],
    ['Curse', 'Dugtrio is afflicted by the curse!'],
    ['Nightmare', 'Dugtrio is locked in a nightmare!'],
    ['move: Fire Spin|[of] p2a: Tyranitar', `Dugtrio is hurt by Fire${NBSP}Spin!`],
    ['item: Shell Bell', `Dugtrio was hurt by the Shell${NBSP}Bell!`],
    [
      'ability: Rough Skin|[of] p2a: Tyranitar',
      `Dugtrio was hurt by the opposing Tyranitar's Rough${NBSP}Skin!`,
    ],
  ])('words damage from %s', (from, text) => {
    const { event, mon } = damage(from)
    if (event.cause === undefined) throw new Error('no cause')
    const source = event.source && mon(event.source)
    expect(hurt(mon(event.who), event.cause, source)).toEqual({ text })
  })

  it('gives damage from a cause without a game message our wording and a fallback', () => {
    const { event, mon } = damage('Solar Flare')
    if (event.cause === undefined) throw new Error('no cause')
    expect(hurt(mon(event.who), event.cause, undefined)).toEqual({
      text: `Dugtrio was hurt by Solar${NBSP}Flare!`,
      fallback: { kind: 'phrase', detail: 'no game message for damage from Solar Flare' },
    })
  })

  it('gives an ability without its source our wording and a fallback', () => {
    const { event, mon } = damage('ability: Rough Skin')
    if (event.cause === undefined) throw new Error('no cause')
    expect(hurt(mon(event.who), event.cause, undefined).fallback).toMatchObject({ kind: 'phrase' })
  })
})

describe('healing (P1)', () => {
  const heal = (...rest: string[]) =>
    sceneOf('heal', ['|-heal|p1a: Dugtrio|80/100', ...rest].join('|'))

  it.each([
    [[], "Dugtrio's HP was restored."],
    [['[from] item: Leftovers'], 'Dugtrio restored a little HP using its Leftovers!'],
    [['[from] drain', '[of] p2a: Tyranitar'], 'The opposing Tyranitar had its energy drained!'],
    [['[from] ability: Water Absorb'], 'Dugtrio had its HP restored.'],
    [['[from] drain'], "Dugtrio's HP was restored."],
  ])('words a heal with %j', (rest, text) => {
    const { event, mon } = heal(...rest)
    const source = event.source && mon(event.source)
    expect(healed(mon(event.who), event.cause, source)).toBe(text)
  })

  it("says whose wish came true, then the HP line, as the game's two messages", () => {
    const { event, mon } = heal('[from] move: Wish', '[wisher] Dugtrio')
    if (event.wisher === undefined) throw new Error('no wisher')
    expect(wishCameTrue(mon(event.wisher))).toBe("Dugtrio's wish came true!")
    expect(healed(mon(event.who), event.cause, undefined)).toBe("Dugtrio's HP was restored.")
  })
})

describe('HP set outright', () => {
  it('says the shared pain for Pain Split alone', () => {
    expect(hpSet({ name: 'Pain Split', kind: 'move' })).toBe('The battlers shared their pain!')
    expect(hpSet({ name: 'Endeavor', kind: 'move' })).toBeUndefined()
    expect(hpSet(undefined)).toBeUndefined()
  })
})
