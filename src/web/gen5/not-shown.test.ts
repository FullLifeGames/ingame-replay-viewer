import { describe, expect, it } from 'vitest'

import JSON_OF from '../../../test/fixtures/replays/gen5ou-2718717830.json'
import { REPLAY_NUMBERS } from '../../gen5/backend/replay.fixtures'
import { countText, notShownCounts, notShownHeading, rowParts } from '../not-shown-list'
import { notShownList, notShownRows } from './not-shown'
import { loadReplay } from './replay-load'

const { replay, lines } = loadReplay(JSON_OF, REPLAY_NUMBERS)
const ROWS = notShownRows(replay, lines)

// Scene: the visitor picks gen5ou-2718717830 and the dump; beside the game the page lists every
// line Black 2 does not show, as the Gen 3 page lists its own: each dropped line and each fallback
// with its line as an editor counts it and the log line's text. The rows name no kind that #110
// still renames, so they hold by shape and line.
describe('notShownRows', () => {
  it('gives one row per dropped line and per fallback', () => {
    expect(ROWS).toHaveLength(replay.dropped.length + replay.fallbacks.length)
    for (const { line, reason, text } of replay.dropped) {
      expect(ROWS).toContainEqual(
        expect.objectContaining({ line: line + 1, what: `dropped: ${reason}`, text }),
      )
    }
    for (const { line, kind, detail } of replay.fallbacks) {
      expect(ROWS).toContainEqual({
        line: line + 1,
        what: `fallback: ${kind}`,
        text: lines[line],
        detail,
        standIn: false,
      })
    }
  })

  it('counts lines from 1, gives each the log line’s text and keeps line order', () => {
    expect(ROWS[0]).toEqual({
      line: 1,
      what: 'dropped: chat',
      text: '|j|☆isolatedstar',
      standIn: false,
    })
    expect(ROWS).toContainEqual({
      line: 251,
      what: 'fallback: form',
      text: '|switch|p1a: Thundurus|Thundurus-Therian, M|100/100',
      detail: 'Thundurus-Therian shows in the base form of Thundurus',
      standIn: false,
    })
    for (const row of ROWS) expect(row.text).toBe(lines[row.line - 1])
    expect(ROWS.map(({ line }) => line)).toEqual(ROWS.map(({ line }) => line).sort((a, b) => a - b))
  })

  // Scene: the Gen 5 page shows no stand-in, so no row says one shows (lane plan D16).
  it('says no stand-in shows for any row', () => {
    expect(ROWS.filter(({ standIn }) => standIn)).toEqual([])
  })

  it('refuses a fallback past the log’s end by its line', () => {
    const past = { ...replay, fallbacks: [{ line: lines.length, kind: 'form', detail: 'x' }] }
    expect(() => notShownRows(past as typeof replay, lines)).toThrow(
      `a fallback points at line ${String(lines.length + 1)}, past the battle log's end`,
    )
  })
})

// Scene: above the rows the page names how many there are and counts them by what happened, in
// the Gen 3 page's words.
describe('notShownList', () => {
  it('gives the heading, the counts and the rows in the Gen 3 page’s words', () => {
    const list = notShownList(ROWS)
    expect(list.heading).toBe(notShownHeading(ROWS.length))
    expect(list.counts).toEqual(notShownCounts(ROWS).map(countText))
    expect(list.rows).toEqual(ROWS.map(rowParts))
  })

  it('counts each dropped reason as the battle script drops it, and the one forme', () => {
    const counts = notShownCounts(ROWS)
    expect(counts.reduce((sum, { count }) => sum + count, 0)).toBe(ROWS.length)
    const chat = replay.dropped.filter(({ reason }) => reason === 'chat').length
    expect(counts).toContainEqual({ what: 'dropped: chat', count: chat })
    expect(counts).toContainEqual({ what: 'fallback: form', count: 1 })
    expect(notShownList(ROWS).counts).toContain('fallback: form (1)')
  })
})
