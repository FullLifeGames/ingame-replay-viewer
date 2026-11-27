import { describe, expect, it } from 'vitest'

import { blockReport, endLines, notShownLines, runSummary } from './gen5-replay-log.ts'

// Every frame and line number here is invented.

const LINES = [
  '|turn|8',
  '|move|p2a: Ninetales|Solar Beam||[still]',
  '|-prepare|p2a: Ninetales|Solar Beam',
  '|-damage|p1a: Politoed|21/100',
  '|move|p1a: Politoed|Toxic|p2a: Ninetales',
  '|-status|p2a: Ninetales|tox',
  '|faint|p1a: Politoed',
]
const BLOCKS = [
  { name: 'b1', lines: [1, 2, 3] },
  { name: 'b2', lines: [4, 5] },
  { name: 'b3', lines: [6] },
]
const mark = (name: string, frame: number) => ({ name, frame })

// Scene: the run's log names what each block showed, so a frame of the run reads against the
// battle log.
describe('blockReport', () => {
  it('gives each block its answer frame, its frames against the limit and its lines', () => {
    const marks = [
      mark('battle', 100),
      mark('hp-before', 4111),
      mark('b1-001', 4112),
      mark('b1-answered', 4311),
      mark('b2-answered', 4561),
      mark('b3-answered', 4611),
    ]
    expect(blockReport(BLOCKS, marks, LINES)).toEqual([
      'b1: answered at frame 4311, 200 frames of 3000; lines 1, 2, 3: |move|p2a: Ninetales|Solar Beam||[still] / |-prepare|p2a: Ninetales|Solar Beam / |-damage|p1a: Politoed|21/100',
      'b2: answered at frame 4561, 250 frames of 3000; lines 4, 5: |move|p1a: Politoed|Toxic|p2a: Ninetales / |-status|p2a: Ninetales|tox',
      'b3: answered at frame 4611, 50 frames of 3000; lines 6: |faint|p1a: Politoed',
    ])
  })

  it('names a block with no answer mark, and gives no count after it', () => {
    const marks = [mark('hp-before', 4111), mark('b2-answered', 4561)]
    expect(blockReport(BLOCKS, marks, LINES)).toEqual([
      'b1: no answer mark; lines 1, 2, 3: |move|p2a: Ninetales|Solar Beam||[still] / |-prepare|p2a: Ninetales|Solar Beam / |-damage|p1a: Politoed|21/100',
      'b2: answered at frame 4561; lines 4, 5: |move|p1a: Politoed|Toxic|p2a: Ninetales / |-status|p2a: Ninetales|tox',
      'b3: no answer mark; lines 6: |faint|p1a: Politoed',
    ])
  })
})

// Scene: a replay that ends on a forfeit: the game holds the last scene, and the log names the
// winner and the line the game has no message for.
describe('endLines', () => {
  it('names the winner and each message after the last turn', () => {
    const end = {
      result: { kind: 'win', line: 9, side: 'far', name: 'abc2158' },
      messages: [{ kind: 'message', line: 7, text: 'isolatedstar forfeited.' }],
    } as const
    expect(endLines(end)).toEqual([
      'end: abc2158 won (the far side, line 9)',
      'end: not in the game: "isolatedstar forfeited." (line 7)',
    ])
  })

  it('names a winner of neither side, a tie and a log with no end', () => {
    const win = { kind: 'win', line: 9, name: 'Carol' } as const
    expect(endLines({ result: win, messages: [] })).toEqual(['end: Carol won (line 9)'])
    const tie = { kind: 'tie', line: 4 } as const
    expect(endLines({ result: tie, messages: [] })).toEqual(['end: a tie (line 4)'])
    expect(endLines({ result: undefined, messages: [] })).toEqual(['end: the log names no winner'])
  })
})

describe('notShownLines', () => {
  it('gives a line per issue or kind with its events counted', () => {
    const list = { '#109': { weather: 2, status: 1 }, line: { message: 1 } }
    expect(notShownLines(list)).toEqual([
      'not shown, #109: weather 2, status 1',
      'not shown, line: message 1',
    ])
  })

  it('says so when the game shows everything', () => {
    expect(notShownLines({})).toEqual(['not shown: nothing'])
  })
})

// Scene: the run's last line, for the issue's evidence: the blocks answered, the longest block
// against its limit, the frames of the play and the wall time.
describe('runSummary', () => {
  it('gives the blocks answered, the longest block, the frames of the play and the wall time', () => {
    const marks = [
      mark('hp-before', 4111),
      mark('b1-answered', 4311),
      mark('b2-answered', 4561),
      mark('end', 4561),
      mark('last-scene', 5270),
    ]
    expect(runSummary(BLOCKS, marks, 2_472_000)).toBe(
      'run: 2 of 3 blocks answered; longest b2, 250 frames of 3000; 1159 frames from hp-before to last-scene; wall 41.2 min',
    )
  })

  it('says so when no block was answered and the last scene has no mark', () => {
    expect(runSummary(BLOCKS, [mark('hp-before', 4111)], 60_000)).toBe(
      'run: 0 of 3 blocks answered; no block answered; no frames from hp-before to last-scene; wall 1.0 min',
    )
  })
})
