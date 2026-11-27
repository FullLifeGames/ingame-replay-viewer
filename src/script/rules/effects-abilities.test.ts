// Gen 5's ability lines that the item and activation rules read in a shape of their own (#117):
// Frisk names no holder, and Mummy passes itself on to the attacker. Skill Swap's activation, whose
// abilities no event holds, stays a dropped line in each of its shapes.
import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../build'
import { eventsAt, gen5ScriptOf, NEXT } from '../testing'

const DUGTRIO = { side: 'near', index: 0 } as const
const TYRANITAR = { side: 'far', index: 0 } as const
const FRISK = '|-item||Leftovers|[from] ability: Frisk|[of] p1a: Dugtrio'

/** Alice's Dugtrio meets Bob's Tyranitar and Skarmory, both in place, then `lines`. The build
 * refuses a `|gametype|doubles` line, so this log names no game type. */
function twoFoesOf(...lines: string[]) {
  const log = [
    '|gen|5',
    '|player|p1|Alice|1|',
    '|player|p2|Bob|2|',
    '|start',
    '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
    '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
    '|switch|p2b: Skarmory|Skarmory, F|100/100',
    ...lines,
  ]
  return { script: buildBattleScript(`${log.join('\n')}\n`), at: log.length - lines.length }
}

describe("Frisk's Gen 5 line", () => {
  // Scene: Dugtrio's Frisk finds Tyranitar's Leftovers; the line names no holder.
  it('gives the item to the foe in place, the one Pokémon Frisk can have looked at', () => {
    const script = gen5ScriptOf(FRISK)

    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'item',
        line: NEXT,
        who: TYRANITAR,
        item: 'Leftovers',
        cause: { name: 'Frisk', kind: 'ability' },
        source: DUGTRIO,
      },
    ])
  })

  // Scene: two foes stand in place, and the line tells neither as the holder.
  it('keeps the line as a dropped line that names the missing holder', () => {
    const { script, at } = twoFoesOf(FRISK)

    expect(eventsAt(script, at)).toEqual([])
    expect(script.dropped.at(-1)).toEqual({
      line: at,
      text: FRISK,
      reason: 'unsupported',
      detail: 'Frisk names no holder among the 2 foes in place',
    })
  })

  // Scene: Tyranitar has fainted, and no foe stands in place for Frisk to look at.
  it('keeps the line as a dropped line when no foe is in place', () => {
    const script = gen5ScriptOf('|faint|p2a: Tyranitar', FRISK)

    expect(eventsAt(script, NEXT + 1)).toEqual([])
    expect(script.dropped.at(-1)).toEqual({
      line: NEXT + 1,
      text: FRISK,
      reason: 'unsupported',
      detail: 'Frisk names no holder among the 0 foes in place',
    })
  })
})

describe("Mummy's line", () => {
  // Scene: Dugtrio touches Tyranitar's Mummy, and Dugtrio's Arena Trap becomes Mummy.
  it("gives the attacker's change of ability to Mummy, with the ability it replaces", () => {
    const line = '|-activate|p2a: Tyranitar|ability: Mummy|Arena Trap|[of] p1a: Dugtrio'
    const script = gen5ScriptOf(line)

    expect(script.dropped.filter(({ line: at }) => at >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'ability',
        line: NEXT,
        who: DUGTRIO,
        ability: 'Mummy',
        replaces: 'Arena Trap',
        cause: { name: 'Mummy', kind: 'ability' },
        source: TYRANITAR,
      },
    ])
  })

  // Scene: the same touch in Showdown's current shape, with the attacker as a positional argument.
  it('reads the shape that names the attacker before the replaced ability alike', () => {
    const line = '|-activate|p2a: Tyranitar|ability: Mummy|p1a: Dugtrio|[ability] Arena Trap'
    const script = gen5ScriptOf(line)

    expect(script.dropped.filter(({ line: at }) => at >= NEXT)).toEqual([])
    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'ability',
        line: NEXT,
        who: DUGTRIO,
        ability: 'Mummy',
        replaces: 'Arena Trap',
        cause: { name: 'Mummy', kind: 'ability' },
        source: TYRANITAR,
      },
    ])
  })

  // Scene: Wandering Spirit swaps two abilities, which no event holds yet.
  it("keeps an ability's swap of two abilities a dropped line", () => {
    const line =
      '|-activate|p2a: Tyranitar|ability: Wandering Spirit|Arena Trap|Sand Stream|[of] p1a: Dugtrio'

    expect(gen5ScriptOf(line).dropped.at(-1)).toMatchObject({
      line: NEXT,
      reason: 'unsupported',
      detail: 'keyword argument [ability]',
    })
  })
})

describe("Skill Swap's line", () => {
  // Scene: a log names Skill Swap's activation without the abilities, as before #117.
  it('keeps the activation without abilities a dropped line', () => {
    const line = '|-activate|p1a: Dugtrio|move: Skill Swap|[of] p2a: Tyranitar'
    const script = gen5ScriptOf(line)

    expect(eventsAt(script, NEXT)).toEqual([])
    expect(script.dropped.at(-1)).toMatchObject({
      line: NEXT,
      reason: 'unsupported',
      detail: 'keyword argument [ability]',
    })
  })

  // Scene: Showdown writes two empty abilities for Gen 4 and earlier, and for allies.
  it('keeps the activation with two empty abilities a dropped line', () => {
    const line = '|-activate|p1a: Dugtrio|move: Skill Swap|||[of] p2a: Tyranitar'
    const script = gen5ScriptOf(line)

    expect(eventsAt(script, NEXT)).toEqual([])
    expect(script.dropped.at(-1)).toMatchObject({
      line: NEXT,
      reason: 'unsupported',
      detail: 'keyword argument [ability]',
    })
  })
})
