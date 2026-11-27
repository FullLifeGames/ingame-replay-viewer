import { describe, expect, it } from 'vitest'

import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import { replayScript } from '../../script/testing.ts'
import { blockRoom } from '../adapter.ts'
import { packCommands } from '../server-cmd.ts'
import type { Gen5Fallback } from './fallbacks.ts'
import { buildGen5Replay, type Gen5Replay } from './replay.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// Built once, outside the specs' time limit.
const FIXTURES = {
  'gen5ou-2718717830': replayScript('gen5ou-2718717830'),
  'smogtours-gen5ou-862240': replayScript('smogtours-gen5ou-862240'),
}
const REPLAYS = Object.entries(FIXTURES).map(([id, script]) => ({
  id,
  script,
  replay: buildGen5Replay(script, NUMBERS),
}))

/** What shows an event without a block: the park (#106), the game itself, or a turn. */
const SHOWN = new Set<ScriptEvent['kind']>(['player', 'teamSize', 'battleStart', 'turn'])
/** The kinds that play in a block while a part of them is listed: a bar that moves silently
 * while its line waits (D6), and a switch-in that plays as a plain switch (`plain`). */
const IN_PART = new Set<ScriptEvent['kind']>(['damage', 'heal', 'setHp', 'switchIn'])

const key = (event: { line: number; event?: string; kind: string }) =>
  `${event.event ?? event.kind} ${String(event.line)}`

/** The fallbacks of the events, by key, with how often each event is listed. */
function listedOf(fallbacks: readonly Gen5Fallback[]): Map<string, number> {
  const listed = new Map<string, number>()
  for (const one of fallbacks) {
    if ('event' in one) {
      listed.set(key(one), (listed.get(key(one)) ?? 0) + 1)
    }
  }
  return listed
}

/** Where each event of the script stands: shown without a block, in a block, listed. */
function placesOf(script: BattleScript, replay: Gen5Replay) {
  const listed = listedOf(replay.fallbacks)
  const inBlocks = new Set(replay.blocks.flatMap((block) => block.lines))
  const firstTurn = script.events.findIndex((event) => event.kind === 'turn')
  return script.events.map((event, i) => ({
    event,
    shown: SHOWN.has(event.kind) || (event.kind === 'switchIn' && i < firstTurn),
    inBlock: inBlocks.has(event.line),
    listed: listed.get(key(event)) ?? 0,
  }))
}

/** The not-shown list, every fallback by issue (`#109`…) or by kind (`line`, `plain`, and the
 * party's `form`, `character` and `moves`), then by event kind, or `party` for the party's. */
function notShown(fallbacks: readonly Gen5Fallback[]) {
  const counts: Record<string, Record<string, number>> = {}
  for (const one of fallbacks) {
    const by = one.kind === 'later' ? one.detail.replace('plays with ', '') : one.kind
    const what = 'event' in one ? one.event : 'party'
    const of = (counts[by] ??= {})
    of[what] = (of[what] ?? 0) + 1
  }
  return counts
}

// Scene: the replay spec of #107. Both Gen 5 OU test replays go through the backend; each event
// plays in a block, is shown by the park, the game or a turn, or is listed as not shown, and the
// list names the issue that plays it.
describe('the Gen 5 OU test replays', () => {
  it('give each event one place: a block, the park, the game, a turn or the list', () => {
    for (const { script, replay } of REPLAYS) {
      expect(new Set(script.events.map(key)).size).toBe(script.events.length)
      const places = placesOf(script, replay)
      expect(places.filter((place) => place.listed > 1).map(({ event }) => key(event))).toEqual([])
      const count = (place: (typeof places)[number]) =>
        Number(place.shown) + Number(place.inBlock) + place.listed
      // A silent bar (D6) or a plain switch is both: it plays in a block, and a part of it waits
      // in the list.
      const inPart = (place: (typeof places)[number]) =>
        IN_PART.has(place.event.kind) && place.inBlock && place.listed === 1 && !place.shown
      const misplaced = places.filter((place) => count(place) !== 1 && !inPart(place))
      expect(misplaced.map(({ event }) => key(event))).toEqual([])
      expect(replay.fallbacks.filter((one) => one.kind === 'line').map(key)).toEqual(
        script.events.filter((event) => event.kind === 'message').map(key),
      )
    }
  })

  it('play the leads’ hits in blocks, each within the room of a block', () => {
    const room = blockRoom({ layout: NUMBERS.adapter, queueSize: NUMBERS.queueSize })
    for (const { replay } of REPLAYS) {
      expect(replay.blocks.length).toBeGreaterThan(0)
      const sizes = replay.blocks.map((block) => packCommands(NUMBERS, block.commands).length)
      expect(sizes.filter((size) => size > room)).toEqual([])
      expect(replay.blocks.map((block) => block.name)).toEqual(
        replay.blocks.map((_, i) => `b${String(i + 1)}`),
      )
    }
  })

  // The list that #109 and #110 shrink.
  it('list what does not show yet by the issue that plays it and by event kind', () => {
    const lists = Object.fromEntries(
      REPLAYS.map(({ id, replay }) => [id, notShown(replay.fallbacks)]),
    )
    expect(lists).toEqual({
      'gen5ou-2718717830': {
        '#109': {
          weather: 15,
          singleTurn: 2,
          block: 1,
          status: 3,
          damage: 19,
          sideStart: 3,
          cureStatus: 1,
          itemEnd: 1,
          item: 1,
          sideEnd: 1,
          statChange: 11,
          heal: 1,
        },
        '#110': { prepare: 1, anim: 1, move: 1, damage: 1, win: 1 },
        line: { message: 1 },
        form: { party: 1 },
      },
      'smogtours-gen5ou-862240': {
        '#109': {
          ability: 4,
          statChange: 16,
          status: 2,
          effectStart: 1,
          cant: 4,
          heal: 10,
          effectEnd: 1,
          singleTurn: 1,
          itemEnd: 4,
          weather: 16,
          sideStart: 2,
          damage: 11,
          effectActivate: 1,
          item: 1,
        },
        '#110': { win: 1 },
        line: { message: 1 },
        form: { party: 2 },
      },
    })
  })
})
