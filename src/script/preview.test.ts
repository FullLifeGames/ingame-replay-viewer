import { describe, expect, it } from 'vitest'

import { buildBattleScript } from './build'
import { scriptOf } from './testing'

// From Gen 5 on a battle opens with Team Preview: the log names both teams of six before the
// first send-out (#87). The lines stay dropped lines, and the script keeps the two teams.
const NEAR = [
  'Landorus-Therian, M',
  'Starmie',
  'Zoroark, L50, F',
  'Arceus-*',
  'Ferrothorn, M',
  'Jirachi',
]
const FAR = [
  'Terrakion',
  'Politoed, F',
  'Tornadus, M',
  'Keldeo-Resolute',
  'Azumarill, M',
  'Latias, F',
]

const PREVIEW = [
  '|clearpoke',
  ...NEAR.map((details) => `|poke|p1|${details}|item`),
  ...FAR.map((details) => `|poke|p2|${details}|item`),
  '|teampreview',
]

const log = (...lines: string[]): string =>
  `${[
    '|gen|5',
    '|player|p1|Alice|1|',
    '|player|p2|Monai|2|',
    ...PREVIEW,
    '|teamsize|p1|6',
    '|teamsize|p2|6',
    '|start',
    ...lines,
  ].join('\n')}\n`

describe('the preview of a battle script', () => {
  it("keeps both sides' six from Team Preview in the log's order", () => {
    const { preview } = buildBattleScript(log())
    expect(preview).toEqual({
      near: [
        { species: 'Landorus-Therian', gender: 'M', level: 100 },
        { species: 'Starmie', level: 100 },
        { species: 'Zoroark', gender: 'F', level: 50 },
        { species: 'Arceus', level: 100 },
        { species: 'Ferrothorn', gender: 'M', level: 100 },
        { species: 'Jirachi', level: 100 },
      ],
      far: [
        { species: 'Terrakion', level: 100 },
        { species: 'Politoed', gender: 'F', level: 100 },
        { species: 'Tornadus', gender: 'M', level: 100 },
        { species: 'Keldeo-Resolute', level: 100 },
        { species: 'Azumarill', gender: 'M', level: 100 },
        { species: 'Latias', gender: 'F', level: 100 },
      ],
    })
  })

  // A hidden forme reads as @pkmn names it, and the send-out that shows the forme later leaves
  // the preview as the log showed it.
  it('names a hidden forme as Team Preview shows it, whatever the send-out reveals', () => {
    const { preview } = buildBattleScript(
      log('|switch|p1a: Arc|Arceus-Ghost|100/100', '|switch|p2a: Terrakion|Terrakion|100/100'),
    )
    expect(preview?.near[3]).toEqual({ species: 'Arceus', level: 100 })
  })

  it('stays dropped lines with the reason "preview"', () => {
    const { dropped } = buildBattleScript(log())
    const lines = dropped.filter(({ reason }) => reason === 'preview').map(({ text }) => text)
    expect(lines).toEqual(PREVIEW)
  })

  it('is absent from a battle without Team Preview', () => {
    expect(scriptOf()).not.toHaveProperty('preview')
  })
})
