import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { itemOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

type Side = 'near' | 'far'

const held = (side: Side, item: number) => ({ op: 'item', side, slot: 0, item })
const CHOICE_BAND = itemOf('Choice Band').number
const shown = (side: Side, name: string) => ({ op: 'itemPopUp', side, item: itemOf(name).number })
const anim = (side: Side, name: string) => ({ op: 'anim', side, anim: name })

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

  it('shows an eaten berry and plays it, then says the cure with the berry and clears the status', () => {
    const scene = sceneOf(
      '|-status|p1a: Dugtrio|brn',
      '|-enditem|p1a: Dugtrio|Lum Berry|[eat]',
      '|-curestatus|p1a: Dugtrio|brn|[msg]',
    )
    expect(scene.slice(3).map(plain)).toEqual([
      shown('near', 'Lum Berry'),
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

describe('item pop-ups (BattleScript_ItemPopUp_Scripting)', () => {
  it('shows the Leftovers of the far Pokémon and heals it with no line', () => {
    const scene = sceneOf('|-heal|p2a: Tyranitar|60/100|[from] item: Leftovers')
    expect(scene.map(plain)).toEqual([
      shown('far', 'Leftovers'),
      anim('far', 'heldItemEffect'),
      anim('far', 'simpleHeal'),
      { op: 'hp', side: 'far', hp: 60 },
    ])
  })

  it("shows a Shell Bell after its holder's hit", () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|40/100',
      '|-heal|p1a: Dugtrio|60/100|[from] item: Shell Bell',
    )
    expect(scene.slice(4).map(plain)).toEqual([
      shown('near', 'Shell Bell'),
      anim('near', 'heldItemEffect'),
      anim('near', 'simpleHeal'),
      { op: 'hp', side: 'near', hp: 60 },
    ])
  })

  it('shows an eaten Sitrus Berry once, plays it, then heals with no line', () => {
    const scene = sceneOf(
      '|-damage|p2a: Tyranitar|40/100',
      '|-enditem|p2a: Tyranitar|Sitrus Berry|[eat]',
      '|-heal|p2a: Tyranitar|65/100|[from] item: Sitrus Berry',
    )
    expect(scene.slice(2).map(plain)).toEqual([
      shown('far', 'Sitrus Berry'),
      anim('far', 'heldItemBerry'),
      held('far', 0),
      anim('far', 'simpleHeal'),
      { op: 'hp', side: 'far', hp: 65 },
    ])
  })

  it('shows the pop-up of a berry eaten for a stat', () => {
    const scene = sceneOf(
      '|-enditem|p1a: Dugtrio|Salac Berry|[eat]',
      '|-boost|p1a: Dugtrio|spe|1|[from] item: Salac Berry',
    )
    expect(scene.slice(0, 3).map(plain)).toEqual([
      shown('near', 'Salac Berry'),
      anim('near', 'heldItemBerry'),
      held('near', 0),
    ])
  })

  // Gen 2's berries (Gold Berry, Berry) have no row in the expansion: the eaten berry plays its
  // animation with no pop-up, and its heal is no berry shown before, so it keeps our line.
  it('keeps the line of a heal by an eaten berry the expansion lacks, and shows no pop-up', () => {
    const result = streamOfLog(
      '|-enditem|p1a: Dugtrio|Gold Berry|[eat]',
      '|-heal|p1a: Dugtrio|70/100|[from] item: Gold Berry',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT).slice(0, -1)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      anim('near', 'heldItemBerry'),
      anim('near', 'heldItemEffect'),
      { op: 'hp', side: 'near', hp: 70 },
      'Dugtrio restored a little HP using its Gold Berry!',
    ])
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([
      [NEXT, 'item'],
      [NEXT + 1, 'item'],
    ])
  })

  it('keeps the line and the fallback of a heal by an item the expansion lacks', () => {
    const result = streamOfLog('|-heal|p1a: Dugtrio|70/100|[from] item: Mail')
    const scene = result.instructions.filter(({ line }) => line >= NEXT).slice(0, -1)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      anim('near', 'heldItemEffect'),
      { op: 'hp', side: 'near', hp: 70 },
      'Dugtrio restored a little HP using its Mail!',
    ])
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([[NEXT, 'item']])
  })
})
