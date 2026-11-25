import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { EXAMPLES_FILE, examplesText, replayFiles, type ReplayFile } from './web-examples.ts'

const fileOf = (id: string, format: string, players: readonly string[]): ReplayFile => ({
  name: `${id}.json`,
  text: JSON.stringify({ id, format, formatid: 'x', players, log: '|win|A' }),
})

describe('the list of example replays', () => {
  // A replay that joins test/fixtures/replays/ or changes fails here until the list is written again.
  it('equals the list generated from test/fixtures/replays/', () => {
    expect(readFileSync(EXAMPLES_FILE, 'utf8')).toBe(examplesText(replayFiles()))
  })

  it("holds each replay's format and players as its JSON gives them, by id in code-unit order", () => {
    const text = examplesText([
      fileOf('gen3ou-2', '[Gen 3] OU', ['B', 'A']),
      fileOf('Gen3ou-1', 'Gen 3 OU', ["O'Neil", 'Zoë "Z"']),
    ])
    expect(JSON.parse(text)).toEqual({
      'Gen3ou-1': { format: 'Gen 3 OU', players: ["O'Neil", 'Zoë "Z"'] },
      'gen3ou-2': { format: '[Gen 3] OU', players: ['B', 'A'] },
    })
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['Gen3ou-1', 'gen3ou-2'])
    expect(text.endsWith('}\n')).toBe(true)
  })

  it('refuses a file whose replay names another id, and one that is no replay', () => {
    const other = { ...fileOf('gen3ou-2', '[Gen 3] OU', ['A', 'B']), name: 'gen3ou-3.json' }
    expect(() => examplesText([other])).toThrow('gen3ou-3.json holds the replay gen3ou-2')
    expect(() => examplesText([{ name: 'gen3ou-4.json', text: '{"id":"gen3ou-4"}' }])).toThrow(
      'gen3ou-4.json',
    )
  })
})
