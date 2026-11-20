import { describe, expect, it } from 'vitest'

import { buildBattleScript } from './build'
import { ScriptError } from './errors'
import { readReplay } from './replay'
import type { ScriptEvent } from './types'

const files = import.meta.glob('../../test/fixtures/replays/*.json', {
  eager: true,
  import: 'default',
})

function logOf(id: string): string {
  return readReplay(files[`../../test/fixtures/replays/${id}.json`]).log
}

const script = buildBattleScript(logOf('smogtours-gen3ou-994052'))

function eventAt(line: number): ScriptEvent | undefined {
  return script.events.find((event) => event.line === line)
}

const INTRO = ['|player|p1|Alice|1|', '|player|p2|Bob|2|', '|teamsize|p1|6', '|teamsize|p2|6']
const LEADS = [
  '|start',
  '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
]

function scriptOf(...lines: string[]): ReturnType<typeof buildBattleScript> {
  return buildBattleScript(`${[...INTRO, ...LEADS, ...lines].join('\n')}\n`)
}

/** The index of the first line after the intro and the two leads. */
const NEXT = INTRO.length + LEADS.length

describe('buildBattleScript: switches and faints', () => {
  it('names whom a voluntary switch replaces', () => {
    expect(eventAt(45)).toEqual({
      kind: 'switchIn',
      line: 45,
      who: { side: 'near', index: 1 },
      replaces: { side: 'near', index: 0 },
      dragged: false,
      hp: { hp: 100, max: 100 },
    })
  })

  it('names no one for a switch after a faint', () => {
    expect(eventAt(35)).toEqual({ kind: 'faint', line: 35, who: { side: 'far', index: 0 } })
    expect(eventAt(38)).toEqual({
      kind: 'switchIn',
      line: 38,
      who: { side: 'far', index: 1 },
      dragged: false,
      hp: { hp: 100, max: 100 },
    })
  })

  it('marks a Roar as a drag', () => {
    expect(eventAt(213)).toMatchObject({
      kind: 'switchIn',
      who: { side: 'near', index: 3 },
      replaces: { side: 'near', index: 2 },
      dragged: true,
    })
  })

  it('gives Baton Pass as the cause of a switch', () => {
    expect(eventAt(75)).toMatchObject({ kind: 'switchIn', cause: { name: 'Baton Pass' } })
  })

  it('keeps the status a Pokémon switches in with', () => {
    const { events } = scriptOf('|switch|p1a: Zapdos|Zapdos|71/100 par')

    expect(events.at(-1)).toMatchObject({ hp: { hp: 71, max: 100 }, status: 'par' })
  })
})

describe('buildBattleScript: intro and end', () => {
  it('has both players and team sizes before battleStart', () => {
    expect(script.events.slice(0, 5)).toEqual([
      {
        kind: 'player',
        line: 3,
        side: 'near',
        name: 'A Welcome Guest',
        avatar: '#uwliiiskyminflyers',
      },
      { kind: 'player', line: 4, side: 'far', name: 'xXEricXx', avatar: 'red' },
      { kind: 'teamSize', line: 21, side: 'near', size: 6 },
      { kind: 'teamSize', line: 22, side: 'far', size: 6 },
      { kind: 'battleStart', line: 23 },
    ])
  })

  it('keeps a player rating', () => {
    const { events } = buildBattleScript('|player|p1|Alice|1|1500\n')

    expect(events).toEqual([
      { kind: 'player', line: 0, side: 'near', name: 'Alice', avatar: '1', rating: 1500 },
    ])
  })

  it('counts turns and keeps the forfeit text', () => {
    expect(eventAt(27)).toEqual({ kind: 'turn', line: 27, number: 1 })
    expect(eventAt(370)).toEqual({ kind: 'message', line: 370, text: 'xXEricXx forfeited.' })
  })

  it('names the side of the winner', () => {
    expect(eventAt(372)).toEqual({ kind: 'win', line: 372, side: 'near', name: 'A Welcome Guest' })
  })

  it('names no side for a winner who is not a player', () => {
    expect(scriptOf('|win|Carol').events.at(-1)).toEqual({ kind: 'win', line: NEXT, name: 'Carol' })
  })

  it('gives a tie no side', () => {
    expect(scriptOf('|tie').events.at(-1)).toEqual({ kind: 'tie', line: NEXT })
  })

  it('reads the generation, the format and the revealed team members', () => {
    expect(script.gen).toBe(3)
    expect(script.format).toBe('[Gen 3] OU')
    expect(script.teams.near.map(({ species }) => species)).toEqual([
      'Dugtrio',
      'Zapdos',
      'Suicune',
      'Claydol',
      'Blissey',
    ])
    expect(script.teams.far[0]).toEqual({
      species: 'Tyranitar',
      name: 'Tyranitar',
      gender: 'M',
      level: 100,
      shiny: false,
    })
    expect(script.teams.near[1]).toEqual({
      species: 'Zapdos',
      name: 'Zapdos',
      level: 100,
      shiny: false,
    })
  })

  it('keeps a nickname apart from the species', () => {
    const { teams } = buildBattleScript(logOf('smogtours-gen3ou-994086'))

    expect(teams.far[0]).toMatchObject({ species: 'Tyranitar', name: 'Fantasy Meadow' })
  })
})

describe('buildBattleScript: lines it cannot show', () => {
  it('lists an unknown line as unknown', () => {
    expect(scriptOf('|-foo|bar').dropped.at(-1)).toEqual({
      line: NEXT,
      text: '|-foo|bar',
      reason: 'unknown',
    })
  })

  it('lists a line without a rule as unsupported', () => {
    expect(scriptOf('|-transform|p1a: Dugtrio|p2a: Tyranitar').dropped.at(-1)).toEqual({
      line: NEXT,
      text: '|-transform|p1a: Dugtrio|p2a: Tyranitar',
      reason: 'unsupported',
      detail: 'no rule for |-transform|',
    })
  })

  it('names a keyword argument its rule does not read', () => {
    const { dropped } = scriptOf('|switch|p1a: Zapdos|Zapdos|100/100|[of] p2a: Tyranitar')

    expect(dropped.at(-1)).toMatchObject({ reason: 'unsupported', detail: 'keyword argument [of]' })
  })

  it('names a positional argument its rule does not read', () => {
    expect(scriptOf('|turn|1|extra').dropped.at(-1)).toMatchObject({
      reason: 'unsupported',
      detail: 'positional argument "extra"',
    })
  })

  it('drops deliberate lines with their reason', () => {
    expect(script.dropped.slice(0, 3)).toEqual([
      {
        line: 0,
        text: "|inactive|Battle timer is ON: inactive players will automatically lose when time's up.",
        reason: 'timer',
      },
      { line: 1, text: '|t:|1795191374', reason: 'timestamp' },
      { line: 2, text: '|gametype|singles', reason: 'metadata' },
    ])
  })
})

describe('buildBattleScript: logs it refuses', () => {
  it('refuses doubles', () => {
    expect(() => buildBattleScript('|gametype|doubles\n')).toThrow(ScriptError)
    expect(() => buildBattleScript('|gametype|doubles\n')).toThrow(/^line 0: .*doubles/)
  })

  it('refuses a faint of a Pokémon that never appeared, with its line', () => {
    expect(() => buildBattleScript('|start\n|faint|p1a: Mew\n')).toThrow(/^line 1: /)
    expect(() => scriptOf('|faint|p1a: Mew')).toThrow(
      new RegExp(`^line ${String(NEXT)}: .*p1a: Mew`),
    )
  })

  it('refuses a turn that is not a number', () => {
    expect(() => scriptOf('|turn|soon')).toThrow(/^line \d+: .*soon/)
  })
})
