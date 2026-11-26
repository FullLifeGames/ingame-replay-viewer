import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, popUp, sceneOf, streamOfLog } from '../testing'

// `BattleScript_ProteanActivates` of the expansion: the ability's pop-up, then
// STRINGID_PKMNCHANGEDTYPE with the holder as B_ATK and the type as B_BUFF1. The expansion says it
// before the move's line; the log puts it after, and the scene keeps the log's order (D18).
describe('a type change by an ability (#88)', () => {
  it.each(['Libero', 'Protean'])('says the change %s makes inside its pop-up', (ability) => {
    const lines = [
      '|move|p2a: Tyranitar|Bug Bite|p1a: Dugtrio',
      `|-start|p2a: Tyranitar|typechange|Bug|[from] ability: ${ability}`,
    ]
    expect(sceneOf(...lines).map(plain)).toEqual([
      'The opposing Tyranitar used Bug Bite!',
      { op: 'move', user: 'far', target: 'near', move: moveOf('Bug Bite').number, animTurn: 0 },
      popUp('far', ability, true),
      'The opposing Tyranitar transformed into the Bug type!',
      popUp('far', ability, false),
    ])
    expect(streamOfLog(...lines).fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  it('names the type of the line on the near side', () => {
    const scene = sceneOf('|-start|p1a: Dugtrio|typechange|Dark|[from] ability: Libero')
    expect(scene.map(plain)[1]).toBe('Dugtrio transformed into the Dark type!')
  })
})

/** The PRINTs and the fallbacks of `lines` after the leads. */
function linesOf(...lines: string[]) {
  const stream = streamOfLog(...lines)
  return {
    texts: sceneOf(...lines)
      .filter(({ op }) => op === 'print')
      .map((instruction) => plain(instruction)),
    fallbacks: stream.fallbacks.filter(({ line }) => line >= NEXT),
  }
}

// The line follows the cause, as the expansion picks it (W1). `BattleScript_ColorChangeActivates`
// prints STRINGID_PKMNCHANGEDTYPEWITH with the holder as B_EFF and the move's type as B_BUFF1.
describe('a type change by its cause (#88)', () => {
  it('says Color Change in its own line inside its pop-up', () => {
    const line = '|-start|p2a: Tyranitar|typechange|Water|[from] ability: Color Change'
    expect(sceneOf(line).map(plain)).toEqual([
      popUp('far', 'Color Change', true),
      "The opposing Tyranitar's type changed to Water!",
      popUp('far', 'Color Change', false),
    ])
    expect(linesOf(line).fallbacks).toEqual([])
  })

  // Conversion, Conversion 2 and Camouflage print STRINGID_PKMNCHANGEDTYPE; Soak and Magic Powder
  // print STRINGID_TARGETCHANGEDTYPE, whose words are the same with the target as B_DEF. Showdown
  // logs all five with no cause.
  it('says a change with no cause as the moves that make one do', () => {
    const { texts, fallbacks } = linesOf(
      '|move|p1a: Dugtrio|Soak|p2a: Tyranitar',
      '|-start|p2a: Tyranitar|typechange|Water',
    )
    expect(texts).toEqual([
      'Dugtrio used Soak!',
      'The opposing Tyranitar transformed into the Water type!',
    ])
    expect(fallbacks).toEqual([])
  })

  // `BattleScript_EffectReflectType`: STRINGID_REFLECTTARGETSTYPE with the user as B_ATK and its
  // target as B_DEF. Showdown logs the change on the user with the target as `[of]` and no type.
  it('says Reflect Type with the Pokémon whose type it took', () => {
    const { texts, fallbacks } = linesOf(
      '|move|p1a: Dugtrio|Reflect Type|p2a: Tyranitar',
      '|-start|p1a: Dugtrio|typechange|[from] move: Reflect Type|[of] p2a: Tyranitar',
    )
    expect(texts).toEqual([
      'Dugtrio used Reflect Type!',
      'Dugtrio became the same type as the opposing Tyranitar!',
    ])
    expect(fallbacks).toEqual([])
  })

  // `BattleScript_EffectThirdType` (Trick-or-Treat, Forest's Curse): STRINGID_THIRDTYPEADDED with
  // the type as B_BUFF1 and the target as B_DEF.
  it("says the type Forest's Curse adds", () => {
    const { texts, fallbacks } = linesOf(
      "|move|p1a: Dugtrio|Forest's Curse|p2a: Tyranitar",
      "|-start|p2a: Tyranitar|typeadd|Grass|[from] move: Forest's Curse",
    )
    expect(texts).toEqual([
      "Dugtrio used Forest's Curse!",
      'Grass type was added to the opposing Tyranitar!',
    ])
    expect(fallbacks).toEqual([])
  })

  // Burn Up and Double Shock log the types that remain, where the game says the move used up its
  // type; Mimicry logs the terrain's types. None of these prints as the type change's line.
  it.each([
    ['Fire', 'move: Burn Up'],
    ['Flying', 'move: Double Shock'],
    ['Electric', 'ability: Mimicry'],
  ])('lists the change to %s by %s and says our line', (type, cause) => {
    const { texts, fallbacks } = linesOf(`|-start|p1a: Dugtrio|typechange|${type}|[from] ${cause}`)
    expect(texts.at(-1)).toBe('Dugtrio is under typechange!')
    expect(fallbacks.map(({ kind, detail }) => ({ kind, detail }))).toContainEqual({
      kind: 'phrase',
      detail: `no game message for typechange starting with ${type}`,
    })
  })

  it.each(['Fire/Flying', '???'])('lists a change to %s and says our line', (type) => {
    const { texts, fallbacks } = linesOf(`|-start|p1a: Dugtrio|typechange|${type}`)
    expect(texts).toEqual(['Dugtrio is under typechange!'])
    expect(fallbacks.map(({ kind, detail }) => ({ kind, detail }))).toEqual([
      { kind: 'phrase', detail: `no game message for typechange starting with ${type}` },
    ])
  })

  it('lists a Reflect Type that names no Pokémon to copy', () => {
    const { texts, fallbacks } = linesOf(
      '|-start|p1a: Dugtrio|typechange|[from] move: Reflect Type',
    )
    expect(texts).toEqual(['Dugtrio is under typechange!'])
    expect(fallbacks.map(({ kind, detail }) => ({ kind, detail }))).toEqual([
      { kind: 'phrase', detail: 'no game message for typechange starting' },
    ])
  })
})
