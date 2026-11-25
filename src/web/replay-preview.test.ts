import { describe, expect, it } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import replay862240 from '../../test/fixtures/replays/smogtours-gen5ou-862240.json'
import { buildBattleScript } from '../script/build'
import { readReplay } from '../script/replay'
import { createReplayChoice, type SavedFile } from './replay-choice'
import { streamOfLoaded } from './stream'

// #87: the teams of Team Preview travel from the picked log to the page. 862240 is a Gen 5
// replay that opens with Team Preview; 994052 is a Gen 3 replay without it.
const GEN5 = readReplay(replay862240)
const GEN3 = readReplay(replay994052)

/** The species of one player's `|poke|` lines, in the log's order: "Landorus-Therian, M" names it. */
const previewSpecies = (log: string, player: 'p1' | 'p2'): string[] =>
  log
    .split('\n')
    .filter((line) => line.startsWith(`|poke|${player}|`))
    .map((line) => line.split('|')[3]?.split(',')[0] ?? '')

const savedFile = (text: string): SavedFile => ({
  name: 'preview.log',
  size: text.length,
  text: () => Promise.resolve(text),
})

const pickFile = (text: string) =>
  createReplayChoice(() => Promise.reject(new Error('offline'))).loadFile(savedFile(text))

describe('the preview of a picked replay', () => {
  it('reaches the summary from a log with Team Preview, six a side in the log order', async () => {
    const expected = buildBattleScript(GEN5.log).preview
    // The near side is p1 in this log, so the far side reads p2's lines.
    expect(expected?.far.map(({ species }) => species)).toEqual(previewSpecies(GEN5.log, 'p2'))
    expect(expected?.near.map(({ species }) => species)).toEqual(previewSpecies(GEN5.log, 'p1'))
    expect(expected?.far).toHaveLength(6)
    expect(streamOfLoaded(GEN5).preview).toEqual(expected)
    expect((await pickFile(GEN5.log))?.preview).toEqual(expected)
  })

  it('stays out of the summary of a log without one', async () => {
    expect(streamOfLoaded(GEN3)).not.toHaveProperty('preview')
    expect(await pickFile(GEN3.log)).not.toHaveProperty('preview')
  })
})
