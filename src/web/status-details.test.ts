import { describe, expect, it } from 'vitest'

import { endedLine, replayDetail, replaySummaryLine, runningLine } from './status'

/** 994052's replay label (label.ts), which every status line names it by (#90). */
const LABEL = 'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)'
const SUMMARY = { label: LABEL, instructions: 461, streamBytes: 8346 }

// #90: the summary above "Not shown" names the replay as the select does; its counts are a
// developer's numbers, so they wait under the page's one "Details".
describe('the summary of the picked replay', () => {
  it('names the replay by its label alone', () => {
    expect(replaySummaryLine(SUMMARY)).toBe(LABEL)
  })

  it('counts its instructions and bytes under "Details"', () => {
    expect(replayDetail(SUMMARY)).toBe('461 instructions, 8346 bytes of instruction stream.')
  })
})

// #90: a run without sound says why in our words; the browser's own words wait under "Details".
describe('the lines of a run without sound', () => {
  const refused = { reason: 'the audio did not resume', words: 'refused for the test' }
  const wordless = { reason: 'the audio did not resume', words: '' }

  it('puts the browser\'s words under "Details" of the running line', () => {
    expect(runningLine({ label: LABEL }, { silence: refused })).toEqual({
      line: `Running ${LABEL}. It plays without sound: the audio did not resume.`,
      detail: 'refused for the test',
    })
  })

  it('puts the browser\'s words under "Details" of the END line', () => {
    expect(endedLine(LABEL, refused)).toEqual({
      line: `Played ${LABEL} to the end of the battle. It played without sound: the audio did not resume.`,
      detail: 'refused for the test',
    })
  })

  it("gives the line alone for a silence without the browser's words", () => {
    expect(runningLine({ label: LABEL }, { silence: wordless })).toEqual({
      line: `Running ${LABEL}. It plays without sound: the audio did not resume.`,
      detail: '',
    })
    expect(endedLine(LABEL, wordless)).toEqual({
      line: `Played ${LABEL} to the end of the battle. It played without sound: the audio did not resume.`,
      detail: '',
    })
  })

  it('gives the line alone for a run with sound', () => {
    expect(runningLine({ label: LABEL }, { silence: undefined })).toEqual({
      line: `Running ${LABEL}.`,
      detail: '',
    })
    expect(endedLine(LABEL)).toEqual({
      line: `Played ${LABEL} to the end of the battle.`,
      detail: '',
    })
  })
})
