import { describe, expect, it } from 'vitest'

import { buildBattleScript } from './build'
import { NAMED_KINDS } from './census'
import type { BattleScript } from './events'
import { readLines } from './lines'
import { REPLAYS } from './testing'
import type { DroppedLine } from './types'

const replays = REPLAYS.map(({ id, log }) => ({ id, log, script: buildBattleScript(log) }))

/** The lines the events stand at. One line may give several events. */
function ownLines(script: BattleScript): Set<number> {
  return new Set(script.events.map(({ line }) => line))
}

/** The lines the events folded, once per fold, so a line folded twice shows twice. */
function foldedLines(script: BattleScript): number[] {
  return script.events.flatMap((event) => ('folded' in event ? (event.folded ?? []) : []))
}

/**
 * A line of a kind the named list keeps as "no rule yet" (#60): it may stand in a test replay as
 * an `unsupported` drop, since the list gives its reason. Every other such drop fails.
 */
function isNamedGap({ reason, detail }: DroppedLine): boolean {
  const kind = /^no rule for (\|.+\|)$/.exec(detail ?? '')?.[1]
  const named = Object.entries(NAMED_KINDS).find(([key]) => key === kind)?.[1]
  return reason === 'unsupported' && named?.group === 'no rule yet'
}

function isSorted(numbers: readonly number[]): boolean {
  return numbers.every((value, i) => i === 0 || (numbers[i - 1] ?? value) <= value)
}

/**
 * The battle script as JSON lines: first the header, then the events and the dropped lines,
 * merged in log order, so a snapshot diff reads along the battle log.
 */
function toJsonl({ gen, format, teams, events, dropped }: BattleScript): string {
  const rows = [...events, ...dropped].sort((a, b) => a.line - b.line)
  return [{ gen, format, teams }, ...rows].map((row) => `${JSON.stringify(row)}\n`).join('')
}

describe.each(replays)('the battle script of $id', ({ id, log, script }) => {
  it('shows, folds or drops every line exactly once', () => {
    const own = ownLines(script)
    const folded = foldedLines(script)
    const dropped = script.dropped.map(({ line }) => line)
    const indices = readLines(log).map(({ index }) => index)

    expect(new Set(folded).size).toBe(folded.length)
    expect(folded.filter((line) => own.has(line))).toEqual([])
    expect(new Set(dropped).size).toBe(dropped.length)
    expect([...own, ...folded].filter((line) => dropped.includes(line))).toEqual([])
    expect([...own, ...folded, ...dropped].sort((a, b) => a - b)).toEqual(indices)
  })

  it('keeps events and dropped lines in log order', () => {
    expect(isSorted(script.events.map(({ line }) => line))).toBe(true)
    expect(isSorted(script.dropped.map(({ line }) => line))).toBe(true)
  })

  it('has no line it cannot show', () => {
    const failing = script.dropped.filter(
      (drop) => (drop.reason === 'unknown' || drop.reason === 'unsupported') && !isNamedGap(drop),
    )

    expect(failing, `lines it cannot show:\n${failing.map(({ text }) => text).join('\n')}`).toEqual(
      [],
    )
  })

  it('matches its snapshot', async () => {
    await expect(toJsonl(script)).toMatchFileSnapshot(`./__snapshots__/${id}.jsonl`)
  })
})
