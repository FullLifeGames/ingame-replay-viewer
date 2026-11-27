// Illusion's end (#98): `|replace|` puts the real Pokémon in the disguise's place. Showdown logs it
// after the hit's `-damage` that broke the disguise, and the client copies the disguise's HP and
// status over, as the line itself carries none.
import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../build'
import { lineNumber } from '../lines'
import { eventsAt } from '../testing'

const INTRO = [
  '|gen|5',
  '|player|p1|Alice|1|',
  '|player|p2|Bob|2|',
  '|teamsize|p1|2',
  '|teamsize|p2|1',
  '|start',
  '|switch|p1a: Latios|Latios, M|100/100',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
  '|turn|1',
  '|move|p2a: Tyranitar|Crunch|p1a: Latios',
  '|-supereffective|p1a: Latios',
]

/** The index of the first line after the hit's effectiveness. */
const HIT = INTRO.length

/** Alice's Zoroark, disguised as Latios, takes Tyranitar's Crunch, then `lines`. */
const scriptOf = (...lines: string[]) => buildBattleScript(`${[...INTRO, ...lines].join('\n')}\n`)

const LATIOS = { side: 'near', index: 0 } as const
const ZOROARK = { side: 'near', index: 1 } as const

describe('Illusion ending (|replace|)', () => {
  it('is a replace event of the real Pokémon at the HP the hit left the disguise', () => {
    const script = scriptOf(
      '|-damage|p1a: Latios|40/100',
      '|replace|p1a: Zoroark|Zoroark, M',
      '|-end|p1a: Zoroark|Illusion',
    )

    expect(script.teams.near.map(({ species }) => species)).toEqual(['Latios', 'Zoroark'])
    expect(eventsAt(script, HIT + 1)).toEqual([
      { kind: 'replace', line: HIT + 1, who: ZOROARK, replaces: LATIOS, hp: { hp: 40, max: 100 } },
    ])
    expect(eventsAt(script, HIT + 2)).toEqual([
      { kind: 'effectEnd', line: HIT + 2, who: ZOROARK, effect: { name: 'Illusion' } },
    ])
    expect(script.dropped.filter(({ reason }) => reason === 'unsupported')).toEqual([])
  })

  it("keeps the disguise's status", () => {
    const script = scriptOf('|-damage|p1a: Latios|40/100 par', '|replace|p1a: Zoroark|Zoroark, M')

    expect(eventsAt(script, HIT + 1)).toEqual([
      {
        kind: 'replace',
        line: HIT + 1,
        who: ZOROARK,
        replaces: LATIOS,
        hp: { hp: 40, max: 100 },
        status: 'par',
      },
    ])
  })

  it('stands the real Pokémon in at 0 HP when the hit knocks it out', () => {
    const script = scriptOf(
      '|-damage|p1a: Latios|0 fnt',
      '|replace|p1a: Zoroark|Zoroark, M',
      '|-end|p1a: Zoroark|Illusion',
      '|faint|p1a: Zoroark',
    )

    expect(eventsAt(script, HIT + 1)).toEqual([
      { kind: 'replace', line: HIT + 1, who: ZOROARK, replaces: LATIOS, hp: { hp: 0, max: 100 } },
    ])
    expect(eventsAt(script, HIT + 3)).toEqual([{ kind: 'faint', line: HIT + 3, who: ZOROARK }])
    expect(script.dropped.filter(({ reason }) => reason === 'unsupported')).toEqual([])
  })

  it('refuses a replace where no Pokémon stands', () => {
    const log = ['|gen|5', '|player|p1|Alice|1|', '|start', '|replace|p1a: Zoroark|Zoroark, M']
    expect(() => buildBattleScript(log.join('\n'))).toThrow(
      new RegExp(`^line ${String(lineNumber(3))}: no disguise stands`),
    )
  })
})
