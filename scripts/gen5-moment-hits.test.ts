import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildGen5Replay } from '../src/gen5/backend/replay'
import { REPLAY_NUMBERS as NUMBERS } from '../src/gen5/backend/replay.fixtures'
import { buildBattleScript } from '../src/script/build'
import { readReplay } from '../src/script/replay'
import { handLog, HITS_TURN } from './gen5-moment-hits'
import { GEN5_PATHS } from './gen5-paths'

const ID = 'gen5ou-2718717830'
const LOG = readReplay(JSON.parse(readFileSync(`${GEN5_PATHS.replays}/${ID}.json`, 'utf8'))).log
const HITS = handLog(LOG, HITS_TURN)
const LINES = HITS.split('\n')
/** The line of the hits log that starts with `text`. */
const lineOf = (text: string) => LINES.findIndex((line) => line.startsWith(text))

// Scene: the scene run of #107 (D14) plays a hand turn of the test replay's leads: Darmanitan's
// Grass Knot hits Politoed super effectively and critically, Politoed's Focus Blast misses, and
// Politoed's Leftovers heal it at the turn's end.
describe('handLog', () => {
  it('keeps the test replay’s lines before its first turn and appends the hand turn', () => {
    const before = LOG.split('\n').slice(0, LOG.split('\n').indexOf('|turn|1'))
    expect(HITS).toBe(`${[...before, ...HITS_TURN].join('\n')}\n`)
    expect(HITS_TURN[0]).toBe('|turn|1')
    expect(HITS_TURN.at(-1)).toBe('|upkeep')
  })

  it('refuses a log with no turn', () => {
    expect(() => handLog('|start\n', HITS_TURN)).toThrow('the log has no |turn| line')
  })
})

describe('the hits turn as blocks', () => {
  const replay = buildGen5Replay(buildBattleScript(HITS), NUMBERS)
  const hit = [lineOf('|move|p2a: Darmanitan|Grass Knot'), lineOf('|-damage|p1a: Politoed|38')]
  const miss = [lineOf('|move|p1a: Politoed|Focus Blast'), lineOf('|-miss|')]
  const heal = [lineOf('|-heal|p1a: Politoed|44/100|[from] item: Leftovers')]

  it('gives three blocks or more in order: the hit’s, the miss’s and the heal’s', () => {
    expect(replay.blocks.length).toBeGreaterThanOrEqual(3)
    expect(replay.blocks.map((block) => block.name)).toEqual(
      replay.blocks.map((_, i) => `b${String(i + 1)}`),
    )
    expect([...new Set(replay.blocks.flatMap((block) => block.lines))]).toEqual([
      ...hit,
      ...miss,
      ...heal,
    ])
    const groupOf = (line: number) =>
      hit.includes(line) ? 'hit' : miss.includes(line) ? 'miss' : 'heal'
    const groups = replay.blocks.map((block) => [...new Set(block.lines.map(groupOf))])
    expect(groups.every((group) => group.length === 1)).toBe(true)
    expect([...new Set(groups.flat())]).toEqual(['hit', 'miss', 'heal'])
  })

  it('sends the hit’s flash and both lines, the miss line and the Leftovers heal', () => {
    expect(replay.blocks.flatMap((block) => block.commands.map((one) => one.command))).toEqual([
      'SC_MOVE_MSG',
      'SC_MOVE_ANIM',
      'SC_OP_SUBTRACT_HP',
      'SC_DAMAGE_PLURAL',
      'SC_MSG_STD',
      'SC_MSG_STD',
      'SC_MOVE_MSG',
      'SC_MSG_SET',
      'SC_USE_HELD_ITEM',
      'SC_EFFECT_BY_POS',
      'SC_OP_ADD_HP',
      'SC_UPDATE_HP_GAUGE',
      'SC_MSG_SET',
    ])
  })

  it('lists no event of the hand turn', () => {
    const turn = lineOf('|turn|1')
    expect(replay.fallbacks.filter((one) => one.line >= turn)).toEqual([])
  })
})
