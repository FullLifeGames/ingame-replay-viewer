import { describe, expect, it } from 'vitest'

import { buildBattleScript } from './build'
import type { BattleScript } from './events'
import { readLines } from './lines'
import { REPLAYS } from './testing'

const replays = REPLAYS.map(({ id, log }) => ({ id, log, script: buildBattleScript(log) }))

/** The lines the events show: their own and the ones they folded. One line may give several. */
function shownLines(script: BattleScript): Set<number> {
  return new Set(
    script.events.flatMap((event) => ['folded' in event ? event.folded : [], [event.line]].flat()),
  )
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
  it('shows or drops every line exactly once', () => {
    const shown = shownLines(script)
    const dropped = script.dropped.map(({ line }) => line)
    const indices = readLines(log).map(({ index }) => index)

    expect(new Set(dropped).size).toBe(dropped.length)
    expect(dropped.filter((line) => shown.has(line))).toEqual([])
    expect([...shown, ...dropped].sort((a, b) => a - b)).toEqual(indices)
  })

  it('keeps events and dropped lines in log order', () => {
    expect(isSorted(script.events.map(({ line }) => line))).toBe(true)
    expect(isSorted(script.dropped.map(({ line }) => line))).toBe(true)
  })

  it('has no line it cannot show', () => {
    const failing = script.dropped.filter(
      ({ reason }) => reason === 'unknown' || reason === 'unsupported',
    )

    expect(failing, `lines it cannot show:\n${failing.map(({ text }) => text).join('\n')}`).toEqual(
      [],
    )
  })

  it('matches its snapshot', async () => {
    await expect(toJsonl(script)).toMatchFileSnapshot(`./__snapshots__/${id}.jsonl`)
  })
})
