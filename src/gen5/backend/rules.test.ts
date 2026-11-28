import { describe, expect, it } from 'vitest'

import type { ScriptEvent } from '../../script/events.ts'
import { eventsFrom, NEXT, scriptOf } from '../../script/testing.ts'
import { type Outcome, outcomesOf, ruleFallbacks, ruleOf } from './rules.ts'

const shown = (outcome: Outcome) => outcome.as

/** Each event of `script` from line NEXT on, by kind, with its outcome. */
function outcomesFrom(...lines: string[]): string[] {
  const script = scriptOf(...lines)
  const outcomes = outcomesOf(script.events)
  const from = script.events.length - eventsFrom(script, NEXT).length
  return outcomes.slice(from).map((outcome, i) => {
    const event = script.events[from + i]
    return `${event?.kind ?? '?'} ${shown(outcome)}`
  })
}

// Scene: the battle script gains an event kind before the Gen 5 backend has a rule for it. The
// kind is one no lane adds, so the case holds once every coming kind has its rule.
describe('ruleOf', () => {
  it('fails by name on an event kind with no Gen 5 rule', () => {
    const unknown = { kind: 'notAKind', line: NEXT } as unknown as ScriptEvent
    expect(() => ruleOf(unknown)).toThrow(
      `no Gen 5 rule for the event kind notAKind (line ${String(NEXT)})`,
    )
    const { events } = scriptOf('|turn|1')
    expect(() => outcomesOf([...events, unknown])).toThrow(
      'no Gen 5 rule for the event kind notAKind',
    )
  })
})

// Scene: a replay's intro, leads and turns, which the park and the game show themselves.
describe('outcomesOf the intro and the turns', () => {
  it('parks the intro, leaves the leads to the game and takes a turn as a boundary', () => {
    const script = scriptOf('|turn|1')
    expect(outcomesOf(script.events).map(shown)).toEqual([
      'park',
      'park',
      'park',
      'park',
      'park',
      'game',
      'game',
      'boundary',
    ])
  })

  it('plays a switch-in after the leads and a faint', () => {
    expect(
      outcomesFrom('|turn|1', '|switch|p1a: Skarmory|Skarmory, M|100/100', '|faint|p2a: Tyranitar'),
    ).toEqual(['turn boundary', 'switchIn play', 'faint play'])
  })

  // #118: a forfeit prints in Black 2's text box with the log's own words.
  it('prints a message of the simulator', () => {
    expect(outcomesFrom('|turn|1', '|message|Bob forfeited.')).toEqual([
      'turn boundary',
      'message print',
    ])
    expect(outcomesOf(scriptOf('|turn|1', '|message|Bob forfeited.').events).at(-1)).toEqual({
      as: 'print',
      text: 'Bob forfeited.',
    })
  })
})

// Scene: the kinds that play, the end, and the kinds Black 2 does not play yet.
describe('outcomesOf the kinds that play and those that do not', () => {
  it('plays a move, its hit, a miss, a failure, an immunity and a Leftovers heal', () => {
    expect(
      outcomesFrom(
        '|turn|1',
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|60/100',
        '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio|[miss]',
        '|-miss|p2a: Tyranitar|p1a: Dugtrio',
        '|move|p1a: Dugtrio|Protect||[still]',
        '|-fail|p1a: Dugtrio',
        '|move|p2a: Tyranitar|Thunderbolt|p1a: Dugtrio',
        '|-immune|p1a: Dugtrio',
        '|-heal|p2a: Tyranitar|66/100|[from] item: Leftovers',
      ),
    ).toEqual([
      'turn boundary',
      'move play',
      'damage play',
      'move play',
      'miss play',
      'move play',
      'fail play',
      'move play',
      'immune play',
      'heal play',
    ])
  })

  it('plays caused lines, heals of a move, status, weather, hazards, loose lines and called moves', () => {
    expect(
      outcomesFrom(
        '|turn|1',
        '|-damage|p2a: Tyranitar|88/100|[from] Stealth Rock',
        '|-heal|p1a: Dugtrio|50/100|[from] drain|[of] p2a: Tyranitar',
        '|-heal|p1a: Dugtrio|60/100',
        '|-status|p1a: Dugtrio|brn',
        '|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar',
        '|-sidestart|p1: Alice|move: Stealth Rock',
        '|-crit|p2a: Tyranitar',
        '|cant|p1a: Dugtrio|par',
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[from]move: Sleep Talk',
        '|-immune|p2a: Tyranitar|[from] ability: Levitate',
        '|-fail|p2a: Tyranitar|par',
        '|-weather|Sandstorm|[upkeep]',
        '|-weather|none',
      ),
    ).toEqual([
      'turn boundary',
      'damage play',
      'heal play',
      'heal play',
      'status play',
      'weather play',
      'sideStart play',
      'crit play',
      'cant play',
      'move play',
      'immune play',
      'fail play',
      'weather line',
      'weather play',
    ])
  })

  // Lane plan D2: ServerControl_TurnCheckWeather puts nothing for a turn of rain or sun, and the
  // sand's turn line no battle C puts.
  it('lists a weather’s turn as a line Black 2 lacks', () => {
    const script = scriptOf(
      '|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar',
      '|turn|1',
      '|-weather|Sandstorm|[upkeep]',
    )
    expect(ruleFallbacks(script.events)).toEqual([
      {
        line: NEXT + 2,
        kind: 'line',
        event: 'weather',
        detail: 'Black 2 shows nothing for a turn of sand',
      },
    ])
  })

  // Lane plan D3: BtlServerFlow_StartBattle runs the leads' switch-in effects before the server
  // holds, so the game shows them itself; the same lines after a switch-in play.
  it('leaves the leads’ effects before the first turn to the game, and plays them after it', () => {
    const intimidate = ['|-ability|p2a: Tyranitar|Intimidate|boost', '|-unboost|p1a: Dugtrio|atk|1']
    expect(outcomesFrom(...intimidate, '|turn|1', ...intimidate)).toEqual([
      'ability game',
      'statChange game',
      'turn boundary',
      'ability play',
      'statChange play',
    ])
  })

  // Lane plan D14: the game keeps the disguise's Pokémon in place (party-state.ts), so the end of
  // Illusion has no look of its own here.
  it("lists Illusion's end as a line and plays the effect's end", () => {
    expect(
      outcomesFrom(
        '|turn|1',
        '|-damage|p1a: Dugtrio|40/100',
        '|replace|p1a: Zoroark|Zoroark, M',
        '|-end|p1a: Zoroark|Illusion',
      ),
    ).toEqual(['turn boundary', 'damage play', 'replace line', 'effectEnd play'])
  })

  // #118 (gen5-print-win): the winner and a tie print in the Gen 3 viewer's words; a winner
  // neither player is has no name to print, so Black 2 holds the last scene and the page names it.
  it('plays a charge skip and prints the winner and a tie', () => {
    const lines = [
      '|turn|1',
      '|move|p1a: Dugtrio|Solar Beam||[still]',
      '|-prepare|p1a: Dugtrio|Solar Beam',
      '|-anim|p1a: Dugtrio|Solar Beam|p2a: Tyranitar',
      '|win|Alice',
    ]
    expect(outcomesFrom(...lines)).toEqual([
      'turn boundary',
      'move play',
      'prepare play',
      'anim play',
      'win print',
    ])
    const last = (...end: string[]) => outcomesOf(scriptOf('|turn|1', ...end).events).at(-1)
    expect(last('|win|Alice')).toEqual({ as: 'print', text: 'Alice won the battle!' })
    expect(last('|tie')).toEqual({ as: 'print', text: 'The battle ended in a tie!' })
    expect(last('|win|Carol')).toEqual({
      as: 'line',
      detail: 'Black 2 holds the last scene; the page names the winner, Carol',
    })
  })

  // Lane plan D8: the kinds no fixture holds wait as unplayed, each a rest for the gate.
  it('lists a hit count and the kinds no fixture holds as unplayed', () => {
    expect(
      outcomesFrom(
        '|turn|1',
        '|move|p2a: Tyranitar|Rock Blast|p1a: Dugtrio',
        '|-damage|p1a: Dugtrio|80/100',
        '|-hitcount|p1a: Dugtrio|1',
        '|-ohko|',
        '|-sethp|p1a: Dugtrio|50/100',
        '|-transform|p1a: Dugtrio|p2a: Tyranitar',
      ),
    ).toEqual([
      'turn boundary',
      'move play',
      'damage play',
      'hitCount unplayed',
      'ohko unplayed',
      'setHp unplayed',
      'transform unplayed',
    ])
  })
})

// Scene: the replay lists each event that does not play yet beside the dropped lines.
describe('ruleFallbacks', () => {
  it('names each unplayed event and each missing line, and none for a printed one', () => {
    const script = scriptOf(
      '|turn|1',
      '|-hitcount|p2a: Tyranitar|2',
      '|message|Bob forfeited.',
      '|win|Carol',
    )
    expect(ruleFallbacks(script.events)).toEqual([
      {
        line: NEXT + 1,
        kind: 'unplayed',
        event: 'hitCount',
        detail: 'Black 2 does not play this yet',
      },
      {
        line: NEXT + 3,
        kind: 'line',
        event: 'win',
        detail: 'Black 2 holds the last scene; the page names the winner, Carol',
      },
    ])
  })

  // Scene: a message with no words would print no page, so it shows neither in the game nor in
  // the page's list unless it is listed.
  it('lists a message whose text is empty or blank as a missing line', () => {
    const script = scriptOf('|turn|1', '|message|', '|-message|   ')
    expect(ruleFallbacks(script.events)).toEqual(
      [1, 2].map((at) => ({
        line: NEXT + at,
        kind: 'line',
        event: 'message',
        detail: 'the message is empty, so Black 2 prints nothing',
      })),
    )
  })
})
