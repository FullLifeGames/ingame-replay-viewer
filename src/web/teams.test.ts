import { describe, expect, it } from 'vitest'

import type { ReplaySummary } from './replay-choice'
import { panelText, sideLine } from './status'
import { teamLists } from './teams'

const PLAIN: ReplaySummary = {
  id: 'gen5ou-2718717830',
  label: 'Gen 5 OU: Alice vs Monai (2718717830)',
  streamBytes: 8346,
  instructions: 461,
  rows: [],
  counts: [],
  players: { near: 'Alice', far: 'Monai' },
}

const WITH_PREVIEW: ReplaySummary = {
  ...PLAIN,
  preview: {
    near: [
      { species: 'Landorus-Therian', gender: 'M', level: 100 },
      { species: 'Starmie', level: 100 },
      { species: 'Zoroark', gender: 'F', level: 50 },
    ],
    far: [
      { species: 'Keldeo-Resolute', level: 100 },
      { species: 'Politoed', gender: 'F', level: 100 },
      { species: 'Pikachu', gender: 'M', level: 5 },
    ],
  },
}

// #87: the viewer lists both teams of Team Preview under the game, the far side first, as the
// panel names the sides.
describe('the team list', () => {
  it('lists each side under its heading, the far side first, in the log order', () => {
    expect(teamLists(WITH_PREVIEW)).toEqual([
      {
        heading: 'Far side: Monai',
        members: ['Keldeo-Resolute', 'Politoed ♀', 'Pikachu ♂ Lv. 5'],
      },
      {
        heading: 'Near side: Alice',
        members: ['Landorus-Therian ♂', 'Starmie', 'Zoroark ♀ Lv. 50'],
      },
    ])
  })

  it("heads each side with the panel's words", () => {
    const [far, near] = teamLists(WITH_PREVIEW) ?? []
    const panel = panelText(WITH_PREVIEW, undefined)
    expect([far?.heading, near?.heading]).toEqual([panel.far, panel.near])
    expect(far?.heading).toBe(sideLine('far', 'Monai'))
    expect(near?.heading).toBe(sideLine('near', 'Alice'))
  })

  it('writes a name with markup as it stands', () => {
    const odd = { ...WITH_PREVIEW, players: { near: '<b>x</b> &amp;', far: 'Monai' } }
    expect(teamLists(odd)?.[1]?.heading).toBe('Near side: <b>x</b> &amp;')
  })

  it('is absent for a replay without Team Preview', () => {
    expect(teamLists(PLAIN)).toBeUndefined()
  })
})
