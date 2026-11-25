import { describe, expect, it } from 'vitest'

import { readReplay } from '../script/replay'
import { exampleLabel, FIRST_REPLAY, TEST_REPLAYS } from './replays'

describe('TEST_REPLAYS', () => {
  it('lists the fifteen test replays, 994052 first', () => {
    expect(FIRST_REPLAY).toBe('smogtours-gen3ou-994052')
    expect(TEST_REPLAYS.map(({ id }) => id)).toEqual([
      'smogtours-gen3ou-994052',
      'gen2ou-2718267553',
      'gen3ou-2717564545',
      'gen3ou-2718507084',
      'gen3randombattle-2717609379',
      'gen4ou-2719079523',
      'gen5ou-2718717830',
      'smogtours-gen1ou-995161',
      'smogtours-gen2ou-993907',
      'smogtours-gen3ou-994086',
      'smogtours-gen3ou-994128',
      'smogtours-gen3ou-994141',
      'smogtours-gen3ou-994176',
      'smogtours-gen4ou-690421',
      'smogtours-gen5ou-862240',
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

describe('the labels of the example replays', () => {
  it('names the format, the players and the number of each test replay', () => {
    expect(TEST_REPLAYS.map(({ label }) => label)).toEqual([
      'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)',
      'Gen 2 OU: GSCKING vs denyro (2718267553)',
      'Gen 3 OU: chronosxsonorhc vs oldsmellybastard (2717564545)',
      'Gen 3 OU: second children vs nya420 (2718507084)',
      'Gen 3 Random Battle: NewbiePlsForgiveMe vs joltylocks (2717609379)',
      'Gen 4 OU: beanstockg vs Model Magneton (2719079523)',
      'Gen 5 OU: isolatedstar vs abc2158 (2718717830)',
      'Gen 1 OU: DADDY TAUROS vs koalacancee (995161)',
      'Gen 2 OU: dark premonitions vs tylerkehne (993907)',
      'Gen 3 OU: dataexpunged vs Halbert Simpson (994086)',
      'Gen 3 OU: Bugsileus vs Christos (994128)',
      'Gen 3 OU: SoggyBagel64 vs Nametab (994141)',
      'Gen 3 OU: Mindnight vs KeshBa45 (994176)',
      "Gen 4 OU: UnMecQuiS'enBranle vs Malekith (690421)",
      'Gen 5 OU: tizio potente ao vs Monai (862240)',
    ])
  })

  it("takes the format and the players from each replay's own JSON", async () => {
    for (const { id, label, load } of TEST_REPLAYS) {
      const { format, players } = readReplay(await load())
      expect(label).toBe(exampleLabel(id, { format, players }))
    }
  })

  it('keeps a format of another shape as it is written, and an id with no number whole', () => {
    expect(
      exampleLabel('gen9vgc2024regg-12', { format: '[Gen 9] VGC 2024 Reg G', players: ['A', 'B'] }),
    ).toBe('Gen 9 VGC 2024 Reg G: A vs B (12)')
    expect(exampleLabel('gen3ou-3', { format: 'Gen 3 OU', players: ['A', 'B'] })).toBe(
      'Gen 3 OU: A vs B (3)',
    )
    expect(exampleLabel('hand-made', { format: '[Gen 3]', players: ['A', 'B'] })).toBe(
      'Gen 3: A vs B (hand-made)',
    )
  })
})
