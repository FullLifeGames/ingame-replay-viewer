import { describe, expect, it } from 'vitest'

import {
  countText,
  dumpLine,
  notShownHeading,
  pickedLine,
  READY_LINE,
  replayLine,
  restartLine,
  rowText,
  startLine,
} from './status'

const ROM_SHA1 = '0123456789abcdef0123456789abcdef01234567'
const ID = 'smogtours-gen3ou-994052'

describe('the status lines', () => {
  it('asks for the dump first on a fresh page', () => {
    expect(READY_LINE).toBe('Pick your US Emerald dump, then press Start.')
  })

  it('names the patched ROM by its SHA1 once the dump passed', () => {
    expect(dumpLine({ romSha1: ROM_SHA1 })).toBe(
      `Your dump is US Emerald, and the page patched it (ROM SHA1 ${ROM_SHA1}). Press Start.`,
    )
  })

  // The running ROM holds the stream, so the patched ROM's SHA1 (the dump line's) is not its own.
  it('names the replay and its stream in bytes, and no SHA1', () => {
    expect(startLine({ id: ID, streamBytes: 8346 })).toBe(
      `Running ${ID}: 8346 bytes of instruction stream.`,
    )
  })

  // A new pick or a Load changes nothing in the running game until the next Start.
  it('asks for Start after a new replay is picked or loaded', () => {
    expect(pickedLine(ID)).toBe(`Picked ${ID}. Press Start to play it.`)
  })

  it('writes large byte counts without separators, as the specs and the snapshot do', () => {
    expect(startLine({ id: ID, streamBytes: 30914 })).toContain('30914 bytes')
  })

  it('says a Restart plays the replay from the start', () => {
    expect(restartLine(ID)).toBe(`Restarted ${ID} from the beginning.`)
  })

  it('sums up the picked replay', () => {
    expect(replayLine({ id: ID, instructions: 461, streamBytes: 8346 })).toBe(
      `${ID}: 461 instructions, 8346 bytes of instruction stream.`,
    )
  })
})

describe('the list of what the game does not show', () => {
  it('counts every row in its heading', () => {
    expect(notShownHeading(0)).toBe('Not shown in the game (0)')
    expect(notShownHeading(150)).toBe('Not shown in the game (150)')
  })

  it('gives each reason with its count', () => {
    expect(countText({ what: 'dropped: spacer', count: 62 })).toBe('dropped: spacer (62)')
  })

  it('gives each row its line, what happened and the log line', () => {
    const row = { line: 12, what: 'dropped: upkeep', text: '|upkeep', standIn: false }
    expect(rowText(row)).toBe('Line 12, dropped: upkeep: |upkeep')
  })

  // Showdown's "|" spacer lines have no text after the bar.
  it('ends a row with an empty log line after what happened', () => {
    const row = { line: 5, what: 'dropped: spacer', text: '', standIn: false }
    expect(rowText(row)).toBe('Line 5, dropped: spacer')
  })

  it('says when the game shows a stand-in for a fallback, and adds the detail', () => {
    const row = {
      line: 40,
      what: 'fallback: move',
      text: '|move|p1a: X|Y|p2a: Z',
      detail: 'Y',
      standIn: true,
    }
    expect(rowText(row)).toBe('Line 40, fallback: move, a stand-in shows: |move|p1a: X|Y|p2a: Z; Y')
  })
})
