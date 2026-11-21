import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import { encodeText } from './charset'
import {
  critical,
  effective,
  failed,
  fainted,
  immune,
  missed,
  statChanged,
  statWontChange,
  usedMove,
} from './phrases'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

describe('move phrases (P1)', () => {
  it('says who used which move, a far user with its prefix (C1)', () => {
    const { event, mon } = sceneOf('move', '|move|p2a: Tyranitar|Spikes|p1a: Dugtrio')
    const text = usedMove(mon(event.user), event.move)
    expect(text).toBe('The opposing Tyranitar used Spikes!')
    expect(encodeText(text)).toHaveLength(text.length)
  })

  it("names a move by the expansion's name, its words held together", () => {
    const { event, mon } = sceneOf('move', '|move|p1a: Dugtrio|Rock Slide|p2a: Tyranitar')
    expect(usedMove(mon(event.user), event.move)).toBe(`Dugtrio used Rock${NBSP}Slide!`)
  })

  it('says the target avoided a missed move', () => {
    const { event, mon } = sceneOf(
      'miss',
      '|move|p1a: Dugtrio|Rock Slide|p2a: Tyranitar|[miss]',
      '|-miss|p1a: Dugtrio|p2a: Tyranitar',
    )
    const target = event.target && mon(event.target)
    expect(missed(mon(event.user), target)).toEqual({
      text: 'The opposing Tyranitar avoided the attack!',
    })
  })

  it('says the attack missed when the log names no target', () => {
    const { event, mon } = sceneOf('miss', '|-miss|p2a: Tyranitar')
    expect(missed(mon(event.user), undefined)).toEqual({
      text: "The opposing Tyranitar's attack missed!",
      fallback: { kind: 'phrase', detail: 'no game message for a miss without a target' },
    })
  })

  it('names a critical hit and the effectiveness a hit carries', () => {
    const { event } = sceneOf(
      'damage',
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-supereffective|p2a: Tyranitar',
      '|-crit|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|20/100',
    )
    expect(event).toMatchObject({ crit: true, effectiveness: 'super' })
    expect(critical()).toBe('A critical hit!')
    expect(effective('super')).toBe("It's super effective!")
    expect(effective('resisted')).toBe("It's not very effective…")
  })

  it('says a move does not affect an immune target', () => {
    const { event, mon } = sceneOf('immune', '|-immune|p2a: Tyranitar')
    expect(immune(mon(event.who))).toBe("It doesn't affect the opposing Tyranitar…")
  })

  it.each([
    ['|-fail|p1a: Dugtrio', 'But it failed!'],
    ['|-fail|p2a: Tyranitar|par', 'The opposing Tyranitar is already paralyzed!'],
    ['|-fail|p2a: Tyranitar|slp', 'The opposing Tyranitar is already asleep!'],
    ['|-fail|p2a: Tyranitar|tox', 'The opposing Tyranitar is already poisoned!'],
    ['|-fail|p2a: Tyranitar|brn', 'The opposing Tyranitar is already burned!'],
    ['|-fail|p2a: Tyranitar|frz', 'But it failed!'],
    [
      '|-fail|p2a: Tyranitar|unboost|Attack|[from] ability: Clear Body|[of] p2a: Tyranitar',
      "The opposing Tyranitar's stats were not lowered!",
    ],
  ])('words the failure %s', (line, text) => {
    const { event, mon } = sceneOf('fail', line)
    expect(failed(mon(event.who), event.effect)).toBe(text)
  })

  it('says a Pokémon fainted', () => {
    const { event, mon } = sceneOf('faint', '|faint|p2a: Tyranitar')
    expect(fainted(mon(event.who))).toBe('The opposing Tyranitar fainted!')
  })
})

describe('stat phrases (P1)', () => {
  it.each([
    ['|-boost|p2a: Tyranitar|atk|1', "The opposing Tyranitar's Attack rose!"],
    ['|-boost|p1a: Dugtrio|spe|2', `Dugtrio's Speed rose${NBSP}sharply!`],
    ['|-boost|p1a: Dugtrio|spa|3', `Dugtrio's Sp.${NBSP}Atk rose${NBSP}drastically!`],
    ['|-unboost|p1a: Dugtrio|atk|1', "Dugtrio's Attack fell!"],
    ['|-unboost|p1a: Dugtrio|spd|2', `Dugtrio's Sp.${NBSP}Def harshly${NBSP}fell!`],
    ['|-unboost|p1a: Dugtrio|accuracy|6', `Dugtrio's accuracy severely${NBSP}fell!`],
    ['|-boost|p1a: Dugtrio|evasion|1', "Dugtrio's evasiveness rose!"],
    ['|-boost|p1a: Dugtrio|def|1', "Dugtrio's Defense rose!"],
  ])('words the stat change %s', (line, text) => {
    const { event, mon } = sceneOf('statChange', line)
    expect(statChanged(mon(event.who), event.stat, event.stages)).toBe(text)
  })

  it('says a stat goes no further, and refuses a change of no stages', () => {
    const { event, mon } = sceneOf('statChange', '|-boost|p1a: Dugtrio|atk|0')
    const dugtrio = mon(event.who)
    expect(statWontChange(dugtrio, 'atk', 'up')).toBe("Dugtrio's Attack won't go any higher!")
    expect(statWontChange(dugtrio, 'def', 'down')).toBe("Dugtrio's Defense won't go any lower!")
    expect(() => statChanged(dugtrio, event.stat, event.stages)).toThrow(Gen3Error)
  })
})
