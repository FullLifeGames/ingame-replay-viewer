// What the Gen 5 backend makes of Gen 5's Frisk and Mummy lines (#117): the battle script gives
// Frisk's item event for the foe in place and Mummy's change of ability for the attacker. The
// party reads both through revealed.ts; the writer's rules play both events, no module writes
// their commands yet, and the replay lists each with #110 (lane plan D13). The pop-ups stay out.
import { describe, expect, it } from 'vitest'

import { gen5ScriptOf, NEXT } from '../../script/testing.ts'
import { buildGen5Replay } from './replay.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'
import { revealedSets } from './revealed.ts'
import { outcomesOf } from './rules.ts'

const FRISK = '|-item||Leftovers|[from] ability: Frisk|[of] p1a: Dugtrio'
const MUMMY = '|-activate|p2a: Tyranitar|ability: Mummy|Arena Trap|[of] p1a: Dugtrio'

/** The replay's fallbacks of events, by kind, line after NEXT and detail. */
const eventFallbacks = (...lines: string[]) =>
  buildGen5Replay(gen5ScriptOf(...lines), NUMBERS).fallbacks.flatMap((one) =>
    one.kind === 'later' || one.kind === 'line'
      ? [`${one.event} ${String(one.line - NEXT)} ${one.detail}`]
      : [],
  )

// Scene: Dugtrio's Frisk finds Tyranitar's Leftovers, and Dugtrio touches Tyranitar's Mummy.
describe('the sets the party writes', () => {
  it('gives the item Frisk finds to the foe and Frisk to the frisker', () => {
    const { sets } = revealedSets(gen5ScriptOf(FRISK))
    expect(sets.far[0]).toEqual({ moves: [], item: 'Leftovers' })
    expect(sets.near[0]).toEqual({ moves: [], ability: 'Frisk' })
  })

  it('gives Mummy to its holder and the ability Mummy replaces to the attacker', () => {
    const { sets } = revealedSets(gen5ScriptOf(MUMMY))
    expect(sets.far[0]).toEqual({ moves: [], ability: 'Mummy' })
    expect(sets.near[0]).toEqual({ moves: [], ability: 'Arena Trap' })
  })
})

describe('the writer', () => {
  // Scene: both lines come before the first turn, where the game plays its own switch-in effects.
  it('leaves both lines before the first turn to the game', () => {
    const script = gen5ScriptOf(FRISK, MUMMY)
    const outcomes = outcomesOf(script.events).slice(-2)
    expect(script.events.slice(-2).map(({ kind }) => kind)).toEqual(['item', 'ability'])
    expect(outcomes).toEqual([{ as: 'game' }, { as: 'game' }])
  })

  // Scene: both lines come in turn 1; their rules play them, and no module writes them yet.
  it('lists both lines in a turn with #110', () => {
    expect(eventFallbacks('|turn|1', FRISK, MUMMY)).toEqual([
      'item 1 plays with #110',
      'ability 2 plays with #110',
    ])
  })
})
