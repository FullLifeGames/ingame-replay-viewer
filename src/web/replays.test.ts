import { describe, expect, it } from 'vitest'

import { readReplay } from '../script/replay'
import { FIRST_REPLAY, TEST_REPLAYS } from './replays'

describe('TEST_REPLAYS', () => {
  it('lists the five test replays, 994052 first', () => {
    expect(FIRST_REPLAY).toBe('smogtours-gen3ou-994052')
    expect(TEST_REPLAYS.map(({ id }) => id)).toEqual([
      'smogtours-gen3ou-994052',
      'smogtours-gen3ou-994086',
      'smogtours-gen3ou-994128',
      'smogtours-gen3ou-994141',
      'smogtours-gen3ou-994176',
    ])
  })

  it('loads each to the replay JSON of its ID', async () => {
    for (const { id, load } of TEST_REPLAYS) {
      const replay = readReplay(await load())
      expect(replay.id).toBe(id)
      expect(replay.log).toContain('|win|')
    }
  })
})
