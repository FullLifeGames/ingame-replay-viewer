import { describe, expect, it } from 'vitest'

import { GEN5_REPLAYS, replayOptions } from './replays'

// Scene: the Gen 5 page offers the test replays of a Gen 5 format alone, each with the label the
// Gen 3 page gives it, from the one list of test replays.
describe('GEN5_REPLAYS', () => {
  it('lists the two Gen 5 test replays with their labels', () => {
    expect(GEN5_REPLAYS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'gen5ou-2718717830', label: 'Gen 5 OU: isolatedstar vs abc2158 (2718717830)' },
      { id: 'smogtours-gen5ou-862240', label: 'Gen 5 OU: tizio potente ao vs Monai (862240)' },
    ])
  })

  it('loads a replay as its JSON', async () => {
    const [first] = GEN5_REPLAYS
    await expect(first?.load()).resolves.toMatchObject({ id: 'gen5ou-2718717830' })
  })
})

// Scene: the page opens on no replay, so every run script that picks the dump on / keeps its
// own plan (lane plan D5); the visitor picks a replay by its label.
describe('replayOptions', () => {
  it('offers "None: start the game only" first, then each Gen 5 replay by label', () => {
    expect(replayOptions()).toEqual([
      { value: '', text: 'None: start the game only' },
      { value: 'gen5ou-2718717830', text: 'Gen 5 OU: isolatedstar vs abc2158 (2718717830)' },
      { value: 'smogtours-gen5ou-862240', text: 'Gen 5 OU: tizio potente ao vs Monai (862240)' },
    ])
  })
})
