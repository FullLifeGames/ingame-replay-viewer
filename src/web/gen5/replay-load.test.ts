import { describe, expect, it } from 'vitest'

import replay from '../../../test/fixtures/replays/gen5ou-2718717830.json'
import { REPLAY_NUMBERS } from '../../gen5/backend/replay.fixtures'
import { loadReplay } from './replay-load'

// Scene: the page builds the Gen 5 replay from the test replay's JSON as the run script does: the
// blocks it plays, the battle's end it says at the last scene and the log's lines by number.
describe('loadReplay', () => {
  it('gives the blocks, the end and the lines of gen5ou-2718717830', () => {
    const loaded = loadReplay(replay, REPLAY_NUMBERS)
    expect(loaded.replay.blocks.length).toBeGreaterThan(50)
    expect(loaded.replay.pin).toBe(REPLAY_NUMBERS.pokebw2.commit)
    expect(loaded.end.result).toMatchObject({ kind: 'win', name: 'abc2158', side: 'far' })
    expect(loaded.end.messages.map(({ text }) => text)).toEqual(['isolatedstar forfeited.'])
    expect(loaded.lines.slice(0, 2)).toEqual(['|j|☆isolatedstar', '|j|☆abc2158'])
    expect(loaded.lines).toEqual(replay.log.replace(/\n$/, '').split('\n'))
  })

  it('passes a reader’s error on by its message', () => {
    expect(() => loadReplay({ id: 'x' }, REPLAY_NUMBERS)).toThrow('replay JSON lacks')
  })
})
