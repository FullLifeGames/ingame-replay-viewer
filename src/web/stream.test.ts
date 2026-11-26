import { describe, expect, it } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import replay994176 from '../../test/fixtures/replays/smogtours-gen3ou-994176.json'
import { buildGen3Stream, type Gen3Stream, PLAYED_GENS_TEXT } from '../gen3/backend'
import { Gen3Error } from '../gen3/errors'
import { showsInPlace } from '../gen3/fallbacks'
import { buildBattleScript } from '../script/build'
import { readReplay, ReplayError } from '../script/replay'
import { notShown, notShownCounts, streamOfLoaded, streamOfReplay } from './stream'

const lines = (log: string) => log.split('\n')

describe('streamOfReplay', () => {
  it('gives 994052 the stream of its battle script', () => {
    const { replay, stream } = streamOfReplay(replay994052)
    expect(replay.id).toBe('smogtours-gen3ou-994052')
    expect(stream.bytes).toEqual(buildGen3Stream(buildBattleScript(replay994052.log)).bytes)
  })

  it('lets the backend refuse a Gen 8 replay', () => {
    const gen8 = { ...replay994052, log: replay994052.log.replace('|gen|3\n', '|gen|8\n') }
    expect(() => streamOfReplay(gen8)).toThrow(Gen3Error)
    expect(() => streamOfReplay(gen8)).toThrow(
      `the stream plays ${PLAYED_GENS_TEXT} battles, this one is Gen 8`,
    )
  })

  it('lets the replay reader refuse JSON without a log', () => {
    const noLog = Object.fromEntries(Object.entries(replay994052).filter(([key]) => key !== 'log'))
    expect(() => streamOfReplay(noLog)).toThrow(ReplayError)
    expect(() => streamOfReplay(noLog)).toThrow('replay JSON lacks "log"')
  })
})

describe('streamOfLoaded', () => {
  it('gives a replay read elsewhere the stream that its JSON gives', () => {
    const replay = readReplay(replay994052)
    const loaded = streamOfLoaded(replay)
    expect(loaded.replay).toBe(replay)
    expect(loaded).toEqual(streamOfReplay(replay994052))
  })

  it('lets the backend refuse a Gen 8 replay', () => {
    const replay = readReplay(replay994052)
    const gen8 = { ...replay, log: replay.log.replace('|gen|3\n', '|gen|8\n') }
    expect(() => streamOfLoaded(gen8)).toThrow(Gen3Error)
  })
})

describe('the players of a replay stream', () => {
  const withLog = (log: string) => streamOfLoaded({ ...readReplay(replay994052), log })

  it('names the two players of 994052 by side, player 1 on the near side', () => {
    expect(streamOfReplay(replay994052).players).toEqual({
      near: 'A Welcome Guest',
      far: 'xXEricXx',
    })
  })

  it('keeps the name of the intro when a player line after the start names another', () => {
    const log = replay994052.log.replace('|turn|1\n', '|player|p2|Someone Else|\n|turn|1\n')
    expect(withLog(log).players.far).toBe('xXEricXx')
  })

  // So the panel never shows a side without its name.
  it('leaves a log that names no player for a side to the backend, which refuses it', () => {
    const log = replay994052.log.replace('|player|p2|xXEricXx|red|\n', '')
    expect(() => withLog(log)).toThrow('the log names no player on the far side')
  })
})

describe('notShown', () => {
  it('lists every dropped line of 994052 by its 1-based line, with its reason and text', () => {
    const { replay, stream } = streamOfReplay(replay994052)
    const rows = notShown(replay, stream)
    expect(stream.fallbacks).toHaveLength(0)
    expect(rows).toEqual(
      stream.dropped.map(({ line, reason, text }) => ({
        line: line + 1,
        what: `dropped: ${reason}`,
        text,
        standIn: false,
      })),
    )
  })

  it('lists 994176 fallbacks with the log line and the detail, beside the dropped lines', () => {
    const { replay, stream } = streamOfReplay(replay994176)
    const rows = notShown(replay, stream)
    expect(stream.fallbacks.length).toBeGreaterThan(0)
    expect(rows).toHaveLength(stream.dropped.length + stream.fallbacks.length)
    for (const fallback of stream.fallbacks) {
      expect(rows).toContainEqual({
        line: fallback.line + 1,
        what: `fallback: ${fallback.kind}`,
        text: lines(replay.log)[fallback.line],
        detail: fallback.detail,
        standIn: showsInPlace(fallback),
      })
    }
    const order = rows.map(({ line }) => line)
    expect(order).toEqual(order.toSorted((a, b) => a - b))
  })

  it('carries the detail of a line the battle script left partly unread', () => {
    const replay = readReplay({ ...replay994052, log: '|gen|3\n|move|p1a: X|Mystery\n' })
    const stream: Gen3Stream = {
      bytes: new Uint8Array(0),
      instructions: [],
      fallbacks: [{ line: 0, kind: 'mechanic', detail: 'no state in the stream for a test' }],
      dropped: [
        { line: 1, text: '|move|p1a: X|Mystery', reason: 'unsupported', detail: '[still]' },
      ],
    }
    expect(notShown(replay, stream)).toEqual([
      {
        line: 1,
        what: 'fallback: mechanic',
        text: '|gen|3',
        detail: 'no state in the stream for a test',
        standIn: false,
      },
      {
        line: 2,
        what: 'dropped: unsupported',
        text: '|move|p1a: X|Mystery',
        detail: '[still]',
        standIn: false,
      },
    ])
  })

  it('refuses a fallback past the end of the battle log', () => {
    const replay = readReplay({ ...replay994052, log: '|gen|3\n' })
    const stream: Gen3Stream = {
      bytes: new Uint8Array(0),
      instructions: [],
      fallbacks: [{ line: 1, kind: 'phrase', detail: 'no game message for a test' }],
      dropped: [],
    }
    expect(() => notShown(replay, stream)).toThrow(
      "a fallback points at line 2, past the battle log's end",
    )
  })
})

describe('notShownCounts', () => {
  it('counts the rows per reason and kind, the largest first', () => {
    const { replay, stream } = streamOfReplay(replay994176)
    const rows = notShown(replay, stream)
    const counts = notShownCounts(rows)
    expect(counts.reduce((sum, { count }) => sum + count, 0)).toBe(rows.length)
    expect(new Set(counts.map(({ what }) => what)).size).toBe(counts.length)
    const sizes = counts.map(({ count }) => count)
    expect(sizes).toEqual(sizes.toSorted((a, b) => b - a))
    expect(counts).toContainEqual({
      what: 'dropped: spacer',
      count: stream.dropped.filter(({ reason }) => reason === 'spacer').length,
    })
  })

  it('orders equal counts by name', () => {
    const row = (what: string) => ({ line: 1, what, text: '', standIn: false })
    expect(notShownCounts([row('b'), row('a')])).toEqual([
      { what: 'a', count: 1 },
      { what: 'b', count: 1 },
    ])
  })
})
