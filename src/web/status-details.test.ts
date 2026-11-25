import { describe, expect, it } from 'vitest'

import { replayDetail, replaySummaryLine } from './status'

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
