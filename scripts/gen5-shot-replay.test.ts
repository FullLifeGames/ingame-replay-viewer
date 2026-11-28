import { describe, expect, it } from 'vitest'

import { pageQuery, replayShotOf, rowsVerdict, shotExit } from './gen5-shot-replay.ts'

// The shot scene of the page's own replay (#111): its command line, the check of the page's
// rows against the Node replay's, and the run's exit code. Every row here is invented.

const NOW = 1_000_000

describe('replayShotOf', () => {
  it('refuses --scene replay without a replay to play', () => {
    // Scene: someone starts the shot scene of the page's replay and forgets which one.
    expect(() => replayShotOf({ scene: 'replay', minutes: '90' }, NOW)).toThrow(
      '--scene replay takes --replay <id>.',
    )
  })

  it('gives the test replay, the marks file to compare with and the deadline', () => {
    const shot = replayShotOf(
      { scene: 'replay', replay: 'gen5ou-1', against: 'runs/r1.json', minutes: '45' },
      NOW,
    )
    expect(shot).toEqual({
      team: { from: 'replay', id: 'gen5ou-1', turns: undefined },
      against: 'runs/r1.json',
      deadlineMs: NOW + 45 * 60_000,
    })
  })

  it('takes the moment script’s rules for the id and the minutes', () => {
    expect(() => replayShotOf({ scene: 'replay', replay: 'Gen5 OU', minutes: '90' }, NOW)).toThrow(
      '--replay takes a test replay\'s id, lower-case letters and digits with single hyphens between them, not "Gen5 OU".',
    )
    expect(() => replayShotOf({ scene: 'replay', replay: 'gen5ou-1', minutes: '0' }, NOW)).toThrow(
      '--minutes takes a positive number, not "0".',
    )
  })

  it('refuses a save, since the replay plays from power-on with no save', () => {
    const values = { scene: 'replay', replay: 'gen5ou-1', minutes: '90', save: 'route.sav' }
    expect(() => replayShotOf(values, NOW)).toThrow(
      '--save is refused with --scene replay: the replay plays from power-on with no save.',
    )
  })

  it('gives nothing for another scene and refuses the replay’s options there', () => {
    expect(replayShotOf({ scene: 'boot', minutes: '90' }, NOW)).toBeUndefined()
    expect(() => replayShotOf({ scene: 'boot', replay: 'gen5ou-1', minutes: '90' }, NOW)).toThrow(
      '--replay and --against are for --scene replay alone.',
    )
    expect(() => replayShotOf({ scene: 'boot', against: 'r1.json', minutes: '90' }, NOW)).toThrow(
      '--replay and --against are for --scene replay alone.',
    )
  })
})

describe('pageQuery', () => {
  it('asks the page for a frame every 30 frames while a block waits in the replay scene', () => {
    // Scene: the shot's marks compare with the run script's, which marks every 30 frames.
    expect(pageQuery({ threads: false, replay: true })).toBe('?every=30')
    expect(pageQuery({ threads: true, replay: true })).toBe('?threads=1&every=30')
  })

  it('keeps the other scenes’ addresses', () => {
    expect(pageQuery({ threads: false, replay: false })).toBe('')
    expect(pageQuery({ threads: true, replay: false })).toBe('?threads=1')
  })
})

describe('rowsVerdict', () => {
  const node = ['Line 3, dropped: chat: |c|a|hi', 'Line 9, fallback: line: |-weather|Sun']

  it('agrees when the page lists every row of the Node replay in its order', () => {
    expect(rowsVerdict([...node], node)).toEqual({
      agree: true,
      lines: ["rows: all 2 agree with the Node replay's"],
    })
  })

  it('fails on a row the page lacks', () => {
    // Scene: the page drops a fallback that the backend lists.
    expect(rowsVerdict(node.slice(0, 1), node)).toEqual({
      agree: false,
      lines: [
        "rows: 1 on the page, 2 in the Node replay's list",
        "row 2: missing on the page, the Node replay's: Line 9, fallback: line: |-weather|Sun",
      ],
    })
  })

  it('fails on a row that differs, naming both texts', () => {
    const page = [node[0] ?? '', 'Line 9, fallback: line: |-weather|Rain']
    expect(rowsVerdict(page, node)).toEqual({
      agree: false,
      lines: [
        'rows: 1 of 2 differ',
        "row 2: Line 9, fallback: line: |-weather|Rain on the page, the Node replay's: Line 9, fallback: line: |-weather|Sun",
      ],
    })
  })

  it('fails on a row the Node replay lacks', () => {
    const page = [...node, 'Line 11, dropped: chat: |c|b|gg']
    expect(rowsVerdict(page, node)).toEqual({
      agree: false,
      lines: [
        "rows: 3 on the page, 2 in the Node replay's list",
        'row 3: Line 11, dropped: chat: |c|b|gg on the page, none in the Node replay',
      ],
    })
  })
})

describe('shotExit', () => {
  it('gives 0 only for an ended play whose rows and marks agree', () => {
    const ok = { phase: 'ended', status: 'done', rows: true, marks: true } as const
    expect(shotExit(ok)).toBe(0)
    expect(shotExit({ ...ok, phase: 'failed', status: 'failed' })).toBe(1)
    expect(shotExit({ ...ok, phase: 'play', status: 'running' })).toBe(1)
    expect(shotExit({ ...ok, phase: undefined })).toBe(1)
    expect(shotExit({ ...ok, rows: false })).toBe(1)
    expect(shotExit({ ...ok, marks: false })).toBe(1)
  })
})
