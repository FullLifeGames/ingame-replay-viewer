import { describe, expect, it } from 'vitest'

import { replayLabel } from './label'

const PLAYERS = ['A Welcome Guest', 'xXEricXx']

describe('the replay label', () => {
  it('names the format, the players and the number the id ends in', () => {
    expect(replayLabel('smogtours-gen3ou-994052', { format: '[Gen 3] OU', players: PLAYERS })).toBe(
      'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)',
    )
  })

  // A battle log without a |tier| line gives an empty format (saved-replay.ts).
  it('leaves out an empty format', () => {
    expect(replayLabel('smogtours-gen3ou-994052', { format: '', players: PLAYERS })).toBe(
      'A Welcome Guest vs xXEricXx (994052)',
    )
  })

  it('keeps a format of another shape as it is written, and an id with no number whole', () => {
    expect(
      replayLabel('gen9vgc2024regg-12', { format: '[Gen 9] VGC 2024 Reg G', players: ['A', 'B'] }),
    ).toBe('Gen 9 VGC 2024 Reg G: A vs B (12)')
    expect(replayLabel('gen3ou-3', { format: 'Gen 3 OU', players: ['A', 'B'] })).toBe(
      'Gen 3 OU: A vs B (3)',
    )
    expect(replayLabel('hand-made', { format: '[Gen 3]', players: ['A', 'B'] })).toBe(
      'Gen 3: A vs B (hand-made)',
    )
  })

  it('names a replay by its format alone when the log names no player', () => {
    expect(replayLabel('gen3ou-3', { format: '[Gen 3] OU', players: [] })).toBe('Gen 3 OU (3)')
  })

  it('is the id itself when the replay names neither format nor players', () => {
    expect(replayLabel('battle-log', { format: '', players: [] })).toBe('battle-log')
  })

  // The names come from other people's replays: the label keeps them as text, never as markup.
  it('keeps a name with markup as it stands', () => {
    expect(replayLabel('gen3ou-3', { format: '', players: ['<b>x</b>', '&amp;'] })).toBe(
      '<b>x</b> vs &amp; (3)',
    )
  })
})
