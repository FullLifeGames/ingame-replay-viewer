import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { itemOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

type Side = 'near' | 'far'

const held = (side: Side, item: number) => ({ op: 'item', side, slot: 0, item })
const CHOICE_BAND = itemOf('Choice Band').number

describe('held items', () => {
  it('moves the item a Thief takes, plays the theft and says it', () => {
    const scene = sceneOf(
      '|-enditem|p2a: Tyranitar|Choice Band|[silent]|[from] move: Thief|[of] p1a: Dugtrio',
      '|-item|p1a: Dugtrio|Choice Band|[from] move: Thief|[of] p2a: Tyranitar',
    )
    expect(scene.map(plain)).toEqual([
      held('far', 0),
      held('near', CHOICE_BAND),
      { op: 'anim', side: 'near', anim: 'itemSteal' },
      "Dugtrio stole the opposing Tyranitar's Choice Band!",
    ])
  })

  it('plays an eaten berry, then says the cure with the berry and clears the status', () => {
    const scene = sceneOf(
      '|-status|p1a: Dugtrio|brn',
      '|-enditem|p1a: Dugtrio|Lum Berry|[eat]',
      '|-curestatus|p1a: Dugtrio|brn|[msg]',
    )
    expect(scene.slice(3).map(plain)).toEqual([
      { op: 'anim', side: 'near', anim: 'heldItemBerry' },
      held('near', 0),
      "Dugtrio's Lum Berry cured its burn!",
      { op: 'status', side: 'near', slot: 0, status: 'none' },
    ])
  })

  it('names the item of a cure the log gives an item cause for', () => {
    const scene = sceneOf('|-curestatus|p2a: Tyranitar|par|[from] item: Lum Berry')
    expect(scene.map(plain)[0]).toBe("The opposing Tyranitar's Lum Berry cured its paralysis!")
  })

  it('says an item knocked off or handed over, and sets what each Pokémon holds', () => {
    const scene = sceneOf(
      '|-enditem|p2a: Tyranitar|Leftovers|[from] move: Knock Off|[of] p1a: Dugtrio',
      '|-item|p2a: Tyranitar|Choice Band|[from] move: Trick',
    )
    expect(scene.map(plain)).toEqual([
      "Dugtrio knocked off the opposing Tyranitar's Leftovers!",
      held('far', 0),
      held('far', CHOICE_BAND),
      'The opposing Tyranitar obtained Choice Band.',
    ])
  })

  it('says an item shown or used up with a line of ours and lists it', () => {
    const result = streamOfLog(
      '|-item|p2a: Tyranitar|Leftovers',
      '|-enditem|p1a: Dugtrio|White Herb',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT).slice(0, -1)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      held('far', itemOf('Leftovers').number),
      "The opposing Tyranitar's Leftovers was revealed!",
      "Dugtrio's White Herb was used up!",
      held('near', 0),
    ])
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([
      [NEXT, 'phrase'],
      [NEXT + 1, 'phrase'],
    ])
  })

  it('shows an item the expansion lacks as text alone', () => {
    const result = streamOfLog(
      '|-item|p2a: Tyranitar|Mail',
      '|-enditem|p2a: Tyranitar|Mail|[silent]',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT).slice(0, -1)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      "The opposing Tyranitar's Mail was revealed!",
    ])
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([
      [NEXT, 'item'],
      [NEXT, 'phrase'],
      [NEXT + 1, 'item'],
    ])
  })
})
