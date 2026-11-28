import { describe, expect, it } from 'vitest'

import { noRuleReason } from './census'
import { dropReasonOf } from './drops'
import { readLines } from './lines'
import type { LogLine } from './lines'
import { NEXT, scriptOf } from './testing'

function lineOf(text: string): LogLine {
  const [line] = readLines(`${text}\n`)
  if (!line) {
    throw new Error(`no line in ${JSON.stringify(text)}`)
  }
  return line
}

const BEFORE_START = [
  ['|', 'spacer'],
  ['', 'spacer'],
  ['|t:|1795191374', 'timestamp'],
  ['|c|☆A Welcome Guest|hf', 'chat'],
  ['|c:|1795191374|☆A Welcome Guest|hf', 'chat'],
  ['|j|☆A Welcome Guest', 'chat'],
  ['|l|☆A Welcome Guest', 'chat'],
  ['|n|☆A Welcome Guest|awelcomeguest', 'chat'],
  [
    "|inactive|Battle timer is ON: inactive players will automatically lose when time's up.",
    'timer',
  ],
  ['|inactiveoff|Battle timer is now OFF.', 'timer'],
  ['|rule|Sleep Clause Mod: Limit one foe put to sleep', 'rule'],
  ['|gametype|singles', 'metadata'],
  ['|gen|3', 'metadata'],
  ['|tier|[Gen 3] OU', 'metadata'],
  ['|rated|', 'metadata'],
  ['|seed|1,2,3,4', 'metadata'],
  ['|upkeep', 'upkeep'],
  ['|raw|<b>hi</b>', 'room'],
  ['|html|<b>hi</b>', 'room'],
  ['|uhtml|poll|<b>hi</b>', 'room'],
  ['|uhtmlchange|poll|<b>hi</b>', 'room'],
  ['|player|p2|', 'room'],
  ['|error|The command "/foo" does not exist.', 'room'],
  ['|bigerror|The server is restarting.', 'room'],
  ['|chatmsg|The battle timer is on.', 'room'],
  ['|chatmsg-raw|<b>The battle timer is on.</b>', 'room'],
  ['|hidelines|hide|awelcomeguest|2', 'room'],
  ['|unlink|awelcomeguest', 'room'],
  ['|notify|Your turn|The battle needs your choice.', 'room'],
  ['|warning|The server is restarting soon.', 'room'],
  ['|:|1795191374', 'timestamp'],
  ['|badge|p1|gold|gen1ou|100-7', 'metadata'],
  ['a line of plain text', 'room'],
  ['|-hint|In Gen 3, Sleep Talk can be used while asleep.', 'hint'],
  ['|debug|BP: 70', 'debug'],
  ['|clearpoke', 'preview'],
  ['|poke|p1|Dugtrio, M|', 'preview'],
  ['|teampreview', 'preview'],
  ['|updatepoke|p1: Dugtrio|Dugtrio, M', 'preview'],
  ['|custom|-endturn|p1a: Dugtrio|1', 'format'],
] as const

describe('dropReasonOf', () => {
  it.each(BEFORE_START)('drops %j as %s', (text, reason) => {
    expect(dropReasonOf(lineOf(text), false)).toBe(reason)
  })

  it('drops a player line after the start as room', () => {
    expect(dropReasonOf(lineOf('|player|p2|xXEricXx|red|'), true)).toBe('room')
  })

  it("drops Roost's turn as state: the client keeps the volatile and the game says nothing", () => {
    expect(dropReasonOf(lineOf('|-singleturn|p1a: Skarmory|move: Roost'), true)).toBe('state')
  })

  // Showdown writes a Mega's details before its `-mega` line, which plays the change, and turns a
  // fainted Mega back for the team list (#125).
  it.each([
    '|detailschange|p2a: Venusaur|Venusaur-Mega, M',
    '|detailschange|p2a: Charizard|Charizard-Mega-X, F',
    '|detailschange|p2: Venusaur|Venusaur, M|[silent]',
  ])('drops %j as state', (text) => {
    expect(dropReasonOf(lineOf(text), true)).toBe('state')
  })

  it('keeps a permanent forme change other than Mega Evolution unsupported, by its reason', () => {
    const text = '|detailschange|p2a: Tyranitar|Kyogre-Primal'
    expect(dropReasonOf(lineOf(text), true)).toBeUndefined()
    expect(scriptOf(text).dropped.filter(({ line }) => line >= NEXT)).toEqual([
      { line: NEXT, text, reason: 'unsupported', detail: noRuleReason('|detailschange|') },
    ])
    expect(noRuleReason('|detailschange|')).toMatch(/^a permanent forme change other than Mega/)
  })

  it.each([
    '|-singleturn|p1a: Dugtrio|Protect',
    '|-singleturn|p1a: Dugtrio|move: Endure',
    '|player|p1|A Welcome Guest|#uwliiiskyminflyers|',
    '|start',
    '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
    '|-foo|bar',
  ])('shows %j', (text) => {
    expect(dropReasonOf(lineOf(text), false)).toBeUndefined()
  })
})
