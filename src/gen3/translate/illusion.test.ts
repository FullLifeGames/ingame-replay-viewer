// Illusion's end (#98) in the stream. Showdown logs `|replace|` after the hit's `-damage` that broke
// the disguise, and the pinned expansion ends it after the hit too (`TryClearIllusion` in
// `MoveEndAbilities`, then `BattleScript_IllusionOff`). The stream has no op that changes the shown
// Pokémon in place, so the disguise goes back and the real Pokémon comes in at its HP without a
// word, and the game's own line follows.
import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../../script/build'
import { buildGen3Stream, type Gen3Stream } from '../backend'
import { illusionGap } from '../fallbacks'
import { plain } from '../testing'

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

/** The index of the hit's `-damage`, the first line after the intro. */
const DAMAGE = INTRO.length
const REPLACE = DAMAGE + 1

/** Alice's Zoroark, disguised as Latios, takes Tyranitar's Crunch, then `lines`. */
const streamOf = (...lines: string[]) =>
  buildGen3Stream(buildBattleScript(`${[...INTRO, ...lines].join('\n')}\n`))

/** The instructions of the log lines from `first` on, with plain spaces, without the END. */
const sceneFrom = (stream: Gen3Stream, first: number) =>
  stream.instructions
    .filter(({ line, instruction }) => line >= first && instruction.op !== 'end')
    .map(({ instruction }) => plain(instruction))

/** The HP op of the hit on the disguise, whose HP the real Pokémon takes over. */
function hpOfHit(stream: Gen3Stream) {
  const hp = stream.instructions.find(
    ({ line, instruction }) => line === DAMAGE && instruction.op === 'hp',
  )?.instruction
  if (hp?.op !== 'hp') throw new Error('the hit has no HP op')
  return hp.hp
}

const WORE_OFF = "Zoroark's illusion wore off!"

describe("Illusion's end (#98)", () => {
  it('swaps the real Pokémon in at the HP the hit left, with the game line and no switch lines', () => {
    const stream = streamOf(
      '|-damage|p1a: Latios|40/100',
      '|replace|p1a: Zoroark|Zoroark, M',
      '|-end|p1a: Zoroark|Illusion',
      '|move|p1a: Zoroark|Focus Blast|p2a: Tyranitar',
      '|-supereffective|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|0 fnt',
      '|faint|p2a: Tyranitar',
      '|win|Alice',
    )
    const scene = sceneFrom(stream, REPLACE)

    expect(scene.slice(0, 3)).toEqual([
      { op: 'withdraw', side: 'near' },
      { op: 'switchIn', side: 'near', slot: 1, hp: hpOfHit(stream), status: 'none' },
      WORE_OFF,
    ])
    expect(scene[3]).toBe('Zoroark used Focus Blast!')
    expect(scene[4]).toMatchObject({ op: 'move', user: 'near' })
    const texts = scene.filter((step) => typeof step === 'string')
    expect(texts.filter((text) => /come back|Go!/.test(text))).toEqual([])
    expect(stream.fallbacks.filter(({ line }) => line >= DAMAGE)).toEqual([
      { line: REPLACE, ...illusionGap() },
    ])
  })

  it('stands the real Pokémon in at 0 HP before it faints when the hit knocks it out', () => {
    const stream = streamOf(
      '|-damage|p1a: Latios|0 fnt',
      '|replace|p1a: Zoroark|Zoroark, M',
      '|-end|p1a: Zoroark|Illusion',
      '|faint|p1a: Zoroark',
      '|win|Bob',
    )

    expect(hpOfHit(stream)).toBe(0)
    expect(sceneFrom(stream, REPLACE).slice(0, 5)).toEqual([
      { op: 'withdraw', side: 'near' },
      { op: 'switchIn', side: 'near', slot: 1, hp: 0, status: 'none' },
      WORE_OFF,
      { op: 'faint', side: 'near' },
      'Zoroark fainted!',
    ])
  })

  it("lists a fallback of the real Pokémon's name on the line that first shows it", () => {
    const stream = streamOf('|-damage|p1a: Latios|40/100', '|replace|p1a: Fox🦊|Zoroark, M')

    expect(stream.fallbacks.filter(({ kind }) => kind === 'character')).toEqual([
      expect.objectContaining({ line: REPLACE }),
    ])
  })
})
