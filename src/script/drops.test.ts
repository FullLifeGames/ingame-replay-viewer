import { describe, expect, it } from 'vitest'

import { dropReasonOf } from './drops'
import { readLines } from './lines'
import type { LogLine } from './lines'

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
  ['a line of plain text', 'room'],
  ['|-hint|In Gen 3, Sleep Talk can be used while asleep.', 'hint'],
] as const

describe('dropReasonOf', () => {
  it.each(BEFORE_START)('drops %j as %s', (text, reason) => {
    expect(dropReasonOf(lineOf(text), false)).toBe(reason)
  })

  it('drops a player line after the start as room', () => {
    expect(dropReasonOf(lineOf('|player|p2|xXEricXx|red|'), true)).toBe('room')
  })

  it.each([
    '|player|p1|A Welcome Guest|#uwliiiskyminflyers|',
    '|start',
    '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
    '|-foo|bar',
  ])('shows %j', (text) => {
    expect(dropReasonOf(lineOf(text), false)).toBeUndefined()
  })
})
