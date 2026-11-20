import { describe, expect, it } from 'vitest'

import { buildBattleScript } from './build'
import { readLines } from './lines'
import { readReplay } from './replay'
import type { BattleScript } from './events'

const DIR = '../../test/fixtures/replays/'

const files = import.meta.glob('../../test/fixtures/replays/*.json', {
  eager: true,
  import: 'default',
})

const replays = Object.entries(files).map(([path, json]) => {
  const { log } = readReplay(json)
  return { id: path.slice(DIR.length, -'.json'.length), log, script: buildBattleScript(log) }
})

/** The lines the events show. Several events may come from one line. */
function shownLines(script: BattleScript): Set<number> {
  return new Set(script.events.map(({ line }) => line))
}

function isSorted(numbers: readonly number[]): boolean {
  return numbers.every((value, i) => i === 0 || (numbers[i - 1] ?? value) <= value)
}

describe.each(replays)('the battle script of $id', ({ log, script }) => {
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
})
