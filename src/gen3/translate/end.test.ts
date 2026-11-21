import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { decodeStream } from '../stream/decode'
import { plain, streamOfLog } from '../testing'

const tail = (...lines: string[]) =>
  streamOfLog(...lines)
    .instructions.filter(({ line }) => line >= NEXT)
    .map(({ line, instruction }) => ({ line, instruction: plain(instruction) }))

describe('the end of the battle (X13)', () => {
  it('says who won and ends the stream with that side as the winner', () => {
    expect(tail('|win|Alice')).toEqual([
      { line: NEXT, instruction: 'Alice won the battle!' },
      { line: NEXT, instruction: { op: 'end', outcome: 'nearWon' } },
    ])
    expect(tail('|win|Bob').at(-1)?.instruction).toEqual({ op: 'end', outcome: 'farWon' })
  })

  it('names a winner who is neither player and ends with an unknown outcome', () => {
    expect(tail('|win|Carol').map(({ instruction }) => instruction)).toEqual([
      'Carol won the battle!',
      { op: 'end', outcome: 'unknown' },
    ])
  })

  it('ends a tie as one, and the bytes end with that END', () => {
    const result = streamOfLog('|tie', '|c|Bob|gg')
    expect(result.instructions.slice(-2).map(({ instruction }) => instruction)).toEqual([
      { op: 'print', text: 'The battle ended in a tie!' },
      { op: 'end', outcome: 'tie' },
    ])
    expect(decodeStream(result.bytes).instructions.at(-1)).toEqual({ op: 'end', outcome: 'tie' })
  })

  it("prints the simulator's own line, such as a forfeit, as it reads", () => {
    expect(tail('|-message|Bob forfeited.', '|win|Alice').slice(0, 1)).toEqual([
      { line: NEXT, instruction: 'Bob forfeited.' },
    ])
  })
})
