// The item rules of the battle script: an item shown, gone or eaten, and one that acts.
import { describe, expect, it } from 'vitest'

import { eventsAt, eventsFrom, NEXT, refIn, replayScript, scriptOf } from '../testing'

// Built once, outside the specs' time limit.
const REPLAY_994086 = replayScript('smogtours-gen3ou-994086')
const REPLAY_994128 = replayScript('smogtours-gen3ou-994128')

describe('the item rules', () => {
  it('lets Thief take the item silently, then shows it with its cause and source', () => {
    const script = REPLAY_994086
    const skySands = refIn(script, 'far', 'Sky Sands')
    const skarmory = refIn(script, 'near', 'Skarmory')
    const thief = { name: 'Thief', kind: 'move' }

    expect(eventsFrom(script, 347).slice(0, 2)).toEqual([
      {
        kind: 'itemEnd',
        line: 347,
        who: skySands,
        item: 'Choice Band',
        cause: thief,
        source: skarmory,
        silent: true,
      },
      {
        kind: 'item',
        line: 348,
        who: skarmory,
        item: 'Choice Band',
        cause: thief,
        source: skySands,
      },
    ])
  })

  it('eats a Lum Berry', () => {
    const script = REPLAY_994128

    expect(eventsAt(script, 66)).toEqual([
      {
        kind: 'itemEnd',
        line: 66,
        who: refIn(script, 'near', 'Kingdra'),
        item: 'Lum Berry',
        eaten: true,
      },
    ])
  })

  it("reads Custap Berry's `[consumed]` and drops nothing", () => {
    const script = scriptOf('|-activate|p2a: Tyranitar|item: Custap Berry|[consumed]')

    expect(eventsAt(script, NEXT)).toEqual([
      {
        kind: 'effectActivate',
        line: NEXT,
        who: { side: 'far', index: 0 },
        effect: { name: 'Custap Berry', kind: 'item' },
        consumed: true,
      },
    ])
    expect(script.dropped.filter(({ line }) => line >= NEXT)).toEqual([])
  })
})
