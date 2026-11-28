import { describe, expect, it } from 'vitest'

import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import { replayScript } from '../../script/testing.ts'
import { blockRoom } from '../adapter.ts'
import { packCommands } from '../server-cmd.ts'
import type { Gen5Fallback } from './fallbacks.ts'
import { notShown } from './not-shown.ts'
import { printedCommand } from './printed.ts'
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

/** What shows an event without a block: the park (#106) or a turn; the game shows every event
 * before the first turn itself (lane plan D3). */
const SHOWN = new Set<ScriptEvent['kind']>(['player', 'teamSize', 'battleStart', 'turn'])

/** The events whose line Black 2 lacks and that print nothing: a weather's turn (D2), the end
 * of a disguise (D14) and a winner neither player is, where the game holds the last scene (#110,
 * D5). A message of the simulator, a winner and a tie print in the text box (#118). */
const lacksLine = (event: ScriptEvent) =>
  event.kind === 'replace' ||
  (event.kind === 'win' && event.side === undefined) ||
  (event.kind === 'weather' && event.phase === 'upkeep')
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
    shown: SHOWN.has(event.kind) || i < firstTurn,
    inBlock: inBlocks.has(event.line),
    listed: listed.get(key(event)) ?? 0,
  }))
}

// Scene: the replay spec of #107. Both Gen 5 OU test replays go through the backend; each event
// plays in a block, is shown by the park, the game or a turn, or is listed as not shown, and the
// list names why by its kind.
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
        script.events.filter(lacksLine).map(key),
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

  // #118, criterion 3: the forfeit and the winner print after the last turn's blocks, each in a
  // block of its own that sends the carrier alone.
  it('print the forfeit and the winner, each in a block of its own at the end', () => {
    const carrier = printedCommand(NUMBERS)
    const printed = Object.fromEntries(
      REPLAYS.map(({ id, script, replay }) => {
        const ends = script.events.filter((e) => e.kind === 'message' || e.kind === 'win')
        const last = replay.blocks.slice(-ends.length)
        expect(last.map((block) => block.lines)).toEqual(ends.map((event) => [event.line]))
        expect(last.every((block) => block.commands.length === 1)).toBe(true)
        expect(last.map((block) => block.commands[0])).toEqual(ends.map(() => carrier))
        const before = replay.blocks.slice(0, -ends.length)
        expect(before.filter((block) => block.print !== undefined)).toEqual([])
        return [id, last.map((block) => block.print)]
      }),
    )
    expect(printed).toEqual({
      'gen5ou-2718717830': ['isolatedstar forfeited.', 'abc2158 won the battle!'],
      'smogtours-gen5ou-862240': ['Monai forfeited.', 'tizio potente ao won the battle!'],
    })
  })

  // The list that #118 leaves: nothing unplayed, only the weather's turns and the forms.
  it('list what does not show by its kind and by event kind', () => {
    const lists = Object.fromEntries(
      REPLAYS.map(({ id, replay }) => [id, notShown(replay.fallbacks)]),
    )
    expect(lists).toEqual({
      'gen5ou-2718717830': {
        line: { weather: 10 },
        form: { party: 1 },
      },
      'smogtours-gen5ou-862240': {
        line: { weather: 15 },
        form: { party: 2 },
      },
    })
  })
})
