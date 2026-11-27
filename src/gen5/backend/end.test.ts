import { describe, expect, it } from 'vitest'

import { NEXT, replayScript, scriptOf } from '../../script/testing.ts'
import { replayEnd } from './end.ts'

// Scene: a replay's battle ends with no scene of the game's own (gen5-battle-end's interim
// answer): the game holds the last scene, and the run's log and later the page name the winner
// and the lines after the last turn, such as a forfeit.
describe('replayEnd', () => {
  it('gives the winner and the message of a forfeit after the last turn', () => {
    const script = scriptOf(
      '|turn|1',
      '|-message|Alice said hello.',
      '|turn|2',
      '|-message|Alice forfeited.',
      '|',
      '|win|Bob',
    )
    expect(replayEnd(script)).toEqual({
      result: { kind: 'win', line: NEXT + 5, side: 'far', name: 'Bob' },
      messages: [{ kind: 'message', line: NEXT + 3, text: 'Alice forfeited.' }],
    })
  })

  it('gives a tie, and no message when the last turn has none', () => {
    const script = scriptOf('|turn|1', '|tie|')
    expect(replayEnd(script)).toEqual({
      result: { kind: 'tie', line: NEXT + 1 },
      messages: [],
    })
  })

  it('gives no result for a log that stops before its end', () => {
    expect(replayEnd(scriptOf('|turn|1', '|-message|Alice forfeited.'))).toEqual({
      result: undefined,
      messages: [{ kind: 'message', line: NEXT + 1, text: 'Alice forfeited.' }],
    })
  })

  // Scene: the first Gen 5 OU test replay ends on isolatedstar's forfeit in turn 20.
  it('names abc2158 the winner of gen5ou-2718717830 after the forfeit', () => {
    expect(replayEnd(replayScript('gen5ou-2718717830'))).toEqual({
      result: { kind: 'win', line: 288, side: 'far', name: 'abc2158' },
      messages: [{ kind: 'message', line: 286, text: 'isolatedstar forfeited.' }],
    })
  })
})
