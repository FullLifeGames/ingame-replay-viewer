import { describe, expect, it } from 'vitest'

import type { ReplayEnd } from '../../gen5/backend/end'
import {
  endLine,
  entryFailedLine,
  everyRefused,
  loadFailedLine,
  loadingLine,
  OUTSIDE_RUN,
  playingLine,
  SAVE_REFUSED,
  stoppedLine,
} from './replay-words'

const LABEL = 'Gen 5 OU: isolatedstar vs abc2158 (2718717830)'

const forfeit = { kind: 'message', line: 400, text: 'isolatedstar forfeited.' } as const
const won: ReplayEnd = {
  result: { kind: 'win', line: 401, side: 'far', name: 'abc2158' },
  messages: [forfeit],
}

// Scene: the status line under the game tells the visitor what the replay does, in whole
// sentences.
describe('the replay’s status lines', () => {
  it('says the load and each block', () => {
    expect(loadingLine(LABEL)).toBe(`Loading ${LABEL}.`)
    expect(playingLine(LABEL, 0, 61)).toBe(`${LABEL}: waiting at the first action menu.`)
    expect(playingLine(LABEL, 12, 61)).toBe(`${LABEL}: block 12 of 61.`)
  })

  // Scene: at the play's end the game holds the last scene and the page says how the battle
  // ended, the simulator's messages after the last turn with it (D11).
  it('says the winner, the messages after the last turn and the last scene', () => {
    expect(endLine(won)).toBe('abc2158 won. isolatedstar forfeited. Black 2 holds the last scene.')
    expect(endLine({ result: { kind: 'tie', line: 300 }, messages: [] })).toBe(
      'The battle ended in a tie. Black 2 holds the last scene.',
    )
    expect(endLine({ result: undefined, messages: [forfeit] })).toBe(
      'The log names no winner. isolatedstar forfeited. Black 2 holds the last scene.',
    )
  })

  it('names a stuck block with its lines counted from 1', () => {
    const failed = 'step 40 "b12" did not hold within 3000 frames; last: returned read 0x0'
    expect(stoppedLine({ name: 'b12', lines: [46, 47] }, failed)).toBe(
      `The replay stopped at b12 (lines 47, 48): ${failed}`,
    )
    expect(stoppedLine({ name: 'b3', lines: [9] }, failed)).toBe(
      `The replay stopped at b3 (line 10): ${failed}`,
    )
    expect(stoppedLine(undefined, failed)).toBe(`The replay stopped: ${failed}`)
  })

  it('says why the replay did not start', () => {
    expect(entryFailedLine('the frame hook threw: Error: x')).toBe(
      'Black 2 did not reach the battle: the frame hook threw: Error: x',
    )
    expect(loadFailedLine(LABEL, 'replay JSON is not an object')).toBe(
      `The page could not build ${LABEL}: replay JSON is not an object`,
    )
  })

  // Scene: a script's own run wins over the picked replay (D14), a replay never plays from a
  // save (D15), and a bad frame count stops the page before the game starts.
  it('refuses an outside run, a save and a bad frame count', () => {
    expect(OUTSIDE_RUN).toBe('A run is already queued, so the page plays no replay.')
    expect(SAVE_REFUSED).toBe(
      'A replay plays from power-on with no save. Remove ?save= from the address to play one.',
    )
    expect(everyRefused('ten')).toBe(
      'The address asks for a frame every "ten" frames, which is no whole number above 0, so the page does not start the game.',
    )
  })
})
