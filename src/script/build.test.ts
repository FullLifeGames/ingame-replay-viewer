import { describe, expect, it } from 'vitest'

import { buildBattleScript } from './build'
import { GameTypeRefusal, ScriptError } from './errors'
import type { ScriptEvent } from './events'
import { lineNumber } from './lines'
import { NEXT, replayScript, scriptOf } from './testing'

// Built once, outside the specs' time limit.
const script = replayScript('smogtours-gen3ou-994052')
const nicknamed = replayScript('smogtours-gen3ou-994086')

function eventAt(line: number): ScriptEvent | undefined {
  return script.events.find((event) => event.line === line)
}

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

  it('names the side of a winner who left the room before the win', () => {
    const { events } = scriptOf('|player|p1|', '|win|Alice')

    expect(events.at(-1)).toEqual({ kind: 'win', line: NEXT + 1, side: 'near', name: 'Alice' })
  })

  it('matches the winner against the players of the intro, not a later player line', () => {
    const { events } = scriptOf('|player|p1|Carol|1|', '|win|Alice')

    expect(events.at(-1)).toEqual({ kind: 'win', line: NEXT + 1, side: 'near', name: 'Alice' })
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

  // The client's species of a Pokémon is its form while a form change or Transform lasts; the
  // team takes the species of its switch line, which the game's party table holds.
  it('names a team member by its own species when the log ends in another form', () => {
    const changed = scriptOf(
      '|switch|p2a: Castform|Castform|100/100',
      '|-formechange|p2a: Castform|Castform-Rainy|[msg]|[from] ability: Forecast',
      '|move|p1a: Dugtrio|Transform|p2a: Castform',
      '|-transform|p1a: Dugtrio|p2a: Castform',
    )
    expect(changed.teams.far[1]).toMatchObject({ species: 'Castform' })
    expect(changed.teams.near[0]).toMatchObject({ species: 'Dugtrio' })
  })

  it('keeps a nickname apart from the species', () => {
    expect(nicknamed.teams.far[0]).toMatchObject({ species: 'Tyranitar', name: 'Fantasy Meadow' })
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
    // Only Gen 4 and later log it, so it stays without a rule.
    const line = '|-swapboost|p1a: Dugtrio|p2a: Tyranitar|atk'
    expect(scriptOf(line).dropped.at(-1)).toEqual({
      line: NEXT,
      text: line,
      reason: 'unsupported',
      detail: 'no rule for |-swapboost|',
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
    expect(() => buildBattleScript('|gametype|doubles\n')).toThrow(/^line 1: .*doubles/)
  })

  it('refuses doubles with a GameTypeRefusal that carries the game type (#59)', () => {
    const build = () => buildBattleScript('|gametype|doubles\n')
    expect(build).toThrow(GameTypeRefusal)
    expect(build).toThrow(
      expect.objectContaining({
        name: 'GameTypeRefusal',
        gameType: 'doubles',
        line: 0,
        message: 'line 1: the game type "doubles" is not singles',
      }),
    )
  })

  it('refuses a faint of a Pokémon that never appeared, with its line', () => {
    expect(() => buildBattleScript('|start\n|faint|p1a: Mew\n')).toThrow(/^line 2: /)
    expect(() => scriptOf('|faint|p1a: Mew')).toThrow(
      new RegExp(`^line ${String(lineNumber(NEXT))}: .*p1a: Mew`),
    )
  })

  it('refuses a turn that is not a number', () => {
    expect(() => scriptOf('|turn|soon')).toThrow(/^line \d+: .*soon/)
  })
})
