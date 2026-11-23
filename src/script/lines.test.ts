import { describe, expect, it } from 'vitest'

import { lineNumber, readLines } from './lines'

describe('readLines', () => {
  it('keeps the index of each line', () => {
    const lines = readLines('|start\n|\n|turn|1\n')

    expect(lines.map(({ index, text }) => [index, text])).toEqual([
      [0, '|start'],
      [1, '|'],
      [2, '|turn|1'],
    ])
    expect(lines.map(({ key }) => key)).toEqual(['|start|', '|done|', '|turn|'])
  })

  it('keeps a last line without a newline', () => {
    expect(readLines('|start\n|turn|1').map(({ text }) => text)).toEqual(['|start', '|turn|1'])
  })

  it('keeps an empty line inside the log', () => {
    expect(readLines('|start\n\n|turn|1\n').map(({ key }) => key)).toEqual([
      '|start|',
      '||',
      '|turn|',
    ])
  })

  it('splits keyword arguments off the end', () => {
    const [line] = readLines('|-damage|p1a: Dugtrio|88/100|[from] Spikes\n')

    expect(line?.args).toEqual(['-damage', 'p1a: Dugtrio', '88/100'])
    expect(line?.kwArgs).toEqual({ from: 'Spikes' })
  })

  it('gives a line outside the protocol no key', () => {
    const [line] = readLines('|-foo|bar')

    expect(line?.key).toBeUndefined()
    expect(line?.text).toBe('|-foo|bar')
  })
})

// A person reads a battle log from its first line as line 1 (#59); LogLine.index stays 0-based.
describe('lineNumber', () => {
  it('counts the line at index 0 as line 1', () => {
    expect(lineNumber(0)).toBe(1)
    expect(lineNumber(28)).toBe(29)
  })

  it('numbers each line of a log as a person counts it', () => {
    const numbers = readLines('|start\n|\n|turn|1\n').map(({ index }) => lineNumber(index))
    expect(numbers).toEqual([1, 2, 3])
  })
})
