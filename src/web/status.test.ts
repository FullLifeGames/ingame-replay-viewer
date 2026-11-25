import { describe, expect, it } from 'vitest'

import replay994086 from '../../test/fixtures/replays/smogtours-gen3ou-994086.json'
import {
  BUILDING_LINE,
  BUILT_LINE,
  CHECKING_LINE,
  countText,
  dumpLine,
  endedLine,
  notShownHeading,
  panelText,
  pickedLine,
  progressLine,
  READY_LINE,
  replayLine,
  restartLine,
  rowText,
  runningLine,
  silenceText,
  STARTING_LINE,
  startLine,
} from './status'
import type { ReplaySummary } from './replay-choice'
import { notShown, streamOfReplay } from './stream'

const ROM_SHA1 = '0123456789abcdef0123456789abcdef01234567'
const ID = 'smogtours-gen3ou-994052'
/** 994052's replay label (label.ts), which every status line names it by (#90). */
const LABEL = 'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)'

describe('the status lines', () => {
  it('asks for the dump first on a fresh page', () => {
    expect(READY_LINE).toBe('Pick your US Emerald dump, then press Start.')
  })

  // #69: the SHA1 is a developer's number, so it waits under "Details".
  it('asks for Start once the dump passed, with the patched ROM\'s SHA1 under "Details"', () => {
    expect(dumpLine({ romSha1: ROM_SHA1 })).toEqual({
      line: 'Your dump is US Emerald, and the page patched it. Press Start.',
      detail: `The patched ROM's SHA1 is ${ROM_SHA1}.`,
    })
  })

  // The running ROM holds the stream, so the patched ROM's SHA1 (the dump line's) is not its own.
  it('names the replay, with its stream in bytes under "Details" and no SHA1', () => {
    expect(startLine({ label: LABEL, streamBytes: 8346 })).toEqual({
      line: `Running ${LABEL}.`,
      detail: '8346 bytes of instruction stream.',
    })
  })

  // A new pick or a Load changes nothing in the running game until the next Start.
  it('asks for Start after a new replay is picked or loaded', () => {
    expect(pickedLine(LABEL)).toBe(`Picked ${LABEL}. Press Start to play it.`)
  })

  it('writes large byte counts without separators, as the specs and the snapshot do', () => {
    expect(startLine({ label: LABEL, streamBytes: 30914 }).detail).toContain('30914 bytes')
  })

  // The game reaches END at the win or tie line; the outro after it belongs to no battle line.
  it('says the replay played to the end of the battle once the game reached END', () => {
    expect(endedLine(LABEL)).toBe(`Played ${LABEL} to the end of the battle.`)
    expect(endedLine(LABEL, undefined)).toBe(`Played ${LABEL} to the end of the battle.`)
  })

  // #59: the END line replaces the running line, so it keeps the reason a run had no sound.
  it('keeps at END the reason a run played without sound', () => {
    expect(endedLine(LABEL, 'the audio did not start: refused for the test')).toBe(
      `Played ${LABEL} to the end of the battle. It played without sound: the audio did not start: refused for the test.`,
    )
  })

  it('gives the running line and the END line one rule for the reason', () => {
    expect(silenceText(undefined, 'plays')).toBe('')
    expect(silenceText('no context', 'plays')).toBe(' It plays without sound: no context.')
    expect(endedLine(LABEL, 'no context')).toBe(
      `Played ${LABEL} to the end of the battle.${silenceText('no context', 'played')}`,
    )
  })

  // The viewer's dump line names no byte count: a visitor has no use for the module's size.
  it("tells the viewer's visitor that the page built the game from the dump", () => {
    expect(BUILDING_LINE).toBe(
      'Checking your dump and building the game. This takes a few seconds.',
    )
    expect(BUILT_LINE).toBe(
      'Your dump is US Emerald, and the page built the game from it. Press Start.',
    )
  })

  it('says a Restart plays the replay from the start', () => {
    expect(restartLine(LABEL)).toBe(`Restarted ${LABEL} from the beginning.`)
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

  // 994086's line 741 is a chat line with a team in Showdown's HTML (#31).
  it('shows a chat line as text without its markup', () => {
    const { replay, stream } = streamOfReplay(replay994086)
    const row = notShown(replay, stream).find(({ line }) => line === 741)
    if (row === undefined) throw new Error('994086 lacks a row for line 741')
    const text = rowText(row)
    expect(text).toContain('Magma Flows (Moltres) @ Leftovers Ability: Pressure')
    expect(text).toContain('EVs: 48 HP / 180 SpA / 44 SpD / 236 Spe')
    expect(text).not.toContain('<')
    expect(text).not.toContain('&#x2f;')
  })

  it('drops the markup from the detail as well', () => {
    const row = {
      line: 9,
      what: 'dropped: raw',
      text: '|raw|<b>x</b>',
      detail: 'a &amp; b',
      standIn: false,
    }
    expect(rowText(row)).toBe('Line 9, dropped: raw: |raw| x; a & b')
  })
})

describe('the panel', () => {
  const summary = (near: string, far: string): ReplaySummary => ({
    id: ID,
    label: LABEL,
    streamBytes: 8346,
    instructions: 461,
    rows: [],
    counts: [],
    players: { near, far },
  })
  const picked = summary('A Welcome Guest', 'xXEricXx')
  const names = { far: 'Far side: xXEricXx', near: 'Near side: A Welcome Guest' }

  it('names the players by side and leaves the turn empty before turn 1', () => {
    expect(panelText(picked, { summary: picked, turn: 0 })).toEqual({ ...names, turn: '' })
  })

  it('shows the turn the game reached while the run plays the pick', () => {
    expect(panelText(picked, { summary: picked, turn: 1 })).toEqual({ ...names, turn: 'Turn 1' })
    expect(panelText(picked, { summary: picked, turn: 28 })).toEqual({ ...names, turn: 'Turn 28' })
  })

  // The names of the pick never stand beside the turn of another battle.
  it('asks for Start when the run plays another replay or none', () => {
    const other = summary('A Welcome Guest', 'xXEricXx')
    const start = { ...names, turn: 'Press Start to play it.' }
    expect(panelText(picked, { summary: other, turn: 12 })).toEqual(start)
    expect(panelText(picked, { summary: undefined, turn: 12 })).toEqual(start)
    expect(panelText(picked, undefined)).toEqual(start)
  })

  it('shares the words of the status line that asks for Start', () => {
    expect(pickedLine(LABEL)).toBe(`Picked ${LABEL}. ${panelText(picked, undefined).turn}`)
  })

  it('stays empty while the page holds no replay', () => {
    const empty = { far: '', near: '', turn: '' }
    expect(panelText(undefined, undefined)).toEqual(empty)
    expect(panelText(undefined, { summary: picked, turn: 3 })).toEqual(empty)
  })

  // The names come from other people's replays; the panel writes them as text (wasm/view.ts).
  it('writes a long name or one with markup as it stands', () => {
    const long = 'W'.repeat(80)
    const odd = summary(long, '<b>x</b> &amp;')
    expect(panelText(odd, undefined)).toMatchObject({
      far: 'Far side: <b>x</b> &amp;',
      near: `Near side: ${long}`,
    })
  })
})

describe("the viewer's run lines", () => {
  const status = {
    frame: 9120,
    finishedAt: 9000,
    done: 461,
    total: 462,
    turn: 30,
    error: 0,
    finished: true,
    playing: false,
  }
  const ring = { skipped: 1, underruns: 2 }
  const silent = {
    finishedMs: undefined,
    output: undefined,
    ring,
    silence: 'no audio worklet',
    streamBytes: 8346,
  }

  it('names the replay once a run starts, and why it plays without sound', () => {
    const picked = { label: LABEL }
    expect(runningLine(picked, { ...silent, silence: undefined })).toBe(`Running ${LABEL}.`)
    expect(runningLine(picked, silent)).toBe(
      `Running ${LABEL}. It plays without sound: no audio worklet.`,
    )
  })

  // #69: the stream's bytes moved from the running line to the progress line under "Details".
  it('counts the frames, the instructions, the stream in bytes and the turn, and the sound', () => {
    expect(progressLine(status, silent)).toBe(
      'Frame 9120, instruction 461 of 462 (8346 bytes of instruction stream), turn 30.',
    )
    expect(progressLine(status, { ...silent, finishedMs: 150_040, output: {} })).toBe(
      'Frame 9120, instruction 461 of 462 (8346 bytes of instruction stream), turn 30. ' +
        'Finished at frame 9000 after 150.0 s. ' +
        'The page skipped 1 sound sample and ran out of sound 2 times.',
    )
  })
})

// #69: the status line says what plays and what to press; the developer's numbers wait under
// "Details". The words of the developers' tools stay off it as well (visitor-report.test.ts).
describe('the status lines a visitor reads', () => {
  const DEVELOPER_WORDS = /bytes|instruction stream|SHA1|npm run|localhost|devbox|tailscale|README/i
  const lineOf = (shown: string | { readonly line: string }) =>
    typeof shown === 'string' ? shown : shown.line

  it.each([
    ['ready', () => READY_LINE],
    ['checking', () => CHECKING_LINE],
    ['patched', () => lineOf(dumpLine({ romSha1: ROM_SHA1 }))],
    ['starting', () => STARTING_LINE],
    ['running on the emulator page', () => lineOf(startLine({ label: LABEL, streamBytes: 8346 }))],
    ['building', () => BUILDING_LINE],
    ['built', () => BUILT_LINE],
    ['running in the viewer', () => runningLine({ label: LABEL }, { silence: 'no audio worklet' })],
    ['restarted', () => restartLine(LABEL)],
    ['picked', () => pickedLine(LABEL)],
    ['ended', () => endedLine(LABEL, 'no audio worklet')],
  ])('holds no byte count, SHA1 or developer word: %s', (_, line) => {
    expect(line()).not.toMatch(DEVELOPER_WORDS)
  })

  // The guard itself: a line with a developer's number fails it.
  it.each([
    'Running x: 8346 bytes of instruction stream.',
    'Patched (ROM SHA1 0123).',
    'Run npm run rom:build.',
  ])('fails a line such as %s', (line) => {
    expect(line).toMatch(DEVELOPER_WORDS)
  })
})
