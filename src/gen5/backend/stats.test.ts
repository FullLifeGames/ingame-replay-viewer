import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, constant, effectWrites, FAR, NEAR, writtenAt } from './effect-testing.ts'
import { lineId } from './lines.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'
import { STAT_SEQUENCES } from './stats.ts'

// The invented battle of REPLAY_NUMBERS: Dugtrio, mon ID 40, against Tyranitar, mon ID 10. Line 0
// is the first line after `|turn|1`.
const DUGTRIO = NEAR.firstMonId
const TYRANITAR = FAR.firstMonId

const set = (line: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_EFFECT_LINES[line]),
  args,
})
const writes = (...lines: string[]) => effectWrites(STAT_SEQUENCES, ...lines)

/** ServerDisplay_StatChange's raise: the stage op, the effect, and the base line. */
const raise = (monId: number, stage: number, stages: number) => [
  cmd('SC_OP_RAISE_STAT_STAGE', monId, stage, stages),
  cmd('SC_STAT_UP_EFFECT', monId, stage, stages),
  set('statRose', monId, stage, stages),
]

// Scene: Tyranitar's Quiver Dance raises its Special Attack, Special Defense and Speed by one
// each. The game picks the stat's name and the degree from the line's arguments.
describe('a raise', () => {
  it('raises each stat with its stage op, its effect and the base line', () => {
    const all = writes(
      '|move|p2a: Tyranitar|Quiver Dance|p2a: Tyranitar',
      '|-boost|p2a: Tyranitar|spa|1',
      '|-boost|p2a: Tyranitar|spd|1',
      '|-boost|p2a: Tyranitar|spe|1',
    )
    expect([1, 2, 3].map((at) => writtenAt(all, at))).toEqual([
      raise(TYRANITAR, constant('BATTLEMON_SP_ATTACK_STAGE'), 1),
      raise(TYRANITAR, constant('BATTLEMON_SP_DEFENSE_STAGE'), 1),
      raise(TYRANITAR, constant('BATTLEMON_SPEED_STAGE'), 1),
    ])
    expect(writtenAt(all, 0)).toBeUndefined()
  })

  it('raises by two with the stages the log gives', () => {
    const all = writes('|move|p1a: Dugtrio|Swords Dance|p1a: Dugtrio', '|-boost|p1a: Dugtrio|atk|2')
    expect(writtenAt(all, 1)).toEqual(raise(DUGTRIO, constant('BATTLEMON_ATTACK_STAGE'), 2))
  })
})

// Scene: Dugtrio's Close Combat lowers its own Defense by one after the hit.
describe('a drop', () => {
  it('lowers the stat with its stage op, its effect and the base line, by the stages alone', () => {
    const all = writes(
      '|move|p1a: Dugtrio|Close Combat|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|20/100',
      '|-unboost|p1a: Dugtrio|def|1',
    )
    expect(writtenAt(all, 2)).toEqual([
      cmd('SC_OP_LOWER_STAT_STAGE', DUGTRIO, constant('BATTLEMON_DEFENSE_STAGE'), 1),
      cmd('SC_STAT_DOWN_EFFECT', DUGTRIO, constant('BATTLEMON_DEFENSE_STAGE'), 1),
      set('statFell', DUGTRIO, constant('BATTLEMON_DEFENSE_STAGE'), 1),
    ])
  })

  it('has no sequence for a stat change of an ability that the log names', () => {
    const all = writes('|-boost|p1a: Dugtrio|spe|1|[from] ability: Speed Boost')
    expect(writtenAt(all, 0)).toBeUndefined()
  })
})

// Scene: Tyranitar's Attack stands at +6 and cannot rise, and Dugtrio's Defense at -6 cannot
// fall. ServerDisplay_StatChangeLimit says so by the stat; nothing changes.
describe('a stat at its limit', () => {
  it('says the stat will not go higher, or lower', () => {
    const all = writes(
      '|move|p2a: Tyranitar|Swords Dance|p2a: Tyranitar',
      '|-boost|p2a: Tyranitar|atk|0',
      '|move|p2a: Tyranitar|Screech|p1a: Dugtrio',
      '|-unboost|p1a: Dugtrio|def|0',
    )
    expect([1, 3].map((at) => writtenAt(all, at))).toEqual([
      [set('statWontRise', TYRANITAR, constant('BATTLEMON_ATTACK_STAGE'))],
      [set('statWontFall', DUGTRIO, constant('BATTLEMON_DEFENSE_STAGE'))],
    ])
  })

  it('has no sequence for a stat out of place', () => {
    const all = writes('|switch|p1a: Politoed|Politoed, M|100/100', '|-unboost|p1: Dugtrio|def|0')
    expect(writtenAt(all, 1)).toBeUndefined()
  })
})
