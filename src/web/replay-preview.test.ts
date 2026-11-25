import { describe, expect, it } from 'vitest'

import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import { buildBattleScript } from '../script/build'
import { readReplay } from '../script/replay'
import type { TeamMember } from '../script/types'
import { createReplayChoice, type SavedFile } from './replay-choice'
import { streamOfLoaded } from './stream'

// #87: the teams of Team Preview travel from the picked log to the page. The gate plays no Gen 5
// replay yet, so 994052 gets Team Preview lines that name the members its log shows, in their
// order, and plays as before.
const REPLAY = readReplay(replay994052)
const { teams } = buildBattleScript(REPLAY.log)

const details = ({ species, gender }: TeamMember): string =>
  gender === undefined ? species : `${species}, ${gender}`

const PREVIEW = [
  '|clearpoke',
  ...teams.near.map((member) => `|poke|p1|${details(member)}|`),
  ...teams.far.map((member) => `|poke|p2|${details(member)}|`),
  '|teampreview',
]
const WITH_PREVIEW = REPLAY.log.replace('\n|start\n', `\n${PREVIEW.join('\n')}\n|start\n`)

const savedFile = (text: string): SavedFile => ({
  name: 'preview.log',
  size: text.length,
  text: () => Promise.resolve(text),
})

const pickFile = (text: string) =>
  createReplayChoice(() => Promise.reject(new Error('offline'))).loadFile(savedFile(text))

describe('the preview of a picked replay', () => {
  it('reaches the summary from a log with Team Preview, in the log order', async () => {
    expect(WITH_PREVIEW).not.toBe(REPLAY.log)
    const expected = buildBattleScript(WITH_PREVIEW).preview
    expect(expected?.far.map(({ species }) => species)).toEqual(
      teams.far.map(({ species }) => species),
    )
    expect(streamOfLoaded({ ...REPLAY, log: WITH_PREVIEW }).preview).toEqual(expected)
    expect((await pickFile(WITH_PREVIEW))?.preview).toEqual(expected)
  })

  it('stays out of the summary of a log without one', async () => {
    expect(streamOfLoaded(REPLAY)).not.toHaveProperty('preview')
    expect(await pickFile(REPLAY.log)).not.toHaveProperty('preview')
  })
})
