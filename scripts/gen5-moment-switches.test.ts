import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildGen5Replay } from '../src/gen5/backend/replay'
import { REPLAY_NUMBERS as NUMBERS } from '../src/gen5/backend/replay.fixtures'
import { buildBattleScript } from '../src/script/build'
import { readReplay } from '../src/script/replay'
import { handLog } from './gen5-moment-hits'
import { SWITCHES_TURNS } from './gen5-moment-switches'
import { GEN5_PATHS } from './gen5-paths'

const ID = 'gen5ou-2718717830'
const LOG = readReplay(JSON.parse(readFileSync(`${GEN5_PATHS.replays}/${ID}.json`, 'utf8'))).log
const SWITCHES = handLog(LOG, SWITCHES_TURNS)
const LINES = SWITCHES.split('\n')
/** The invented numbers with a block room wide enough that no action of the scene splits, as
 * none splits in the game's room. */
const WIDE = 0x200
const data = NUMBERS.adapter.fields['sendCmd.data']
const ROOMY = {
  ...NUMBERS,
  queueSize: WIDE,
  adapter: {
    ...NUMBERS.adapter,
    fields: {
      ...NUMBERS.adapter.fields,
      'sendCmd.data': { offset: data?.offset ?? 0, size: WIDE },
    },
  },
}
/** The line of the switches log that starts with `text`. */
const lineOf = (text: string) => LINES.findIndex((line) => line.startsWith(text))

// Scene: the scene run of #108 (D10) plays three hand turns after the test replay's start:
// Politoed's Scald hits Darmanitan and Darmanitan's Roar drags Ferrothorn in; then Darmanitan
// switches to Blissey and Ferrothorn to Keldeo; then Keldeo's Secret Sword knocks Blissey out,
// and Volcarona comes in after the turn's end.
describe('the switches turns', () => {
  it('start at the first turn and end with the send-in after the faint', () => {
    expect(SWITCHES_TURNS[0]).toBe('|turn|1')
    expect(SWITCHES_TURNS.at(-1)).toBe('|switch|p2a: Volcarona|Volcarona, M|100/100')
  })
})

describe('the switches turns as blocks', () => {
  const replay = buildGen5Replay(buildBattleScript(SWITCHES), ROOMY)

  it('give seven blocks in order, each opening with its first line and command', () => {
    const opening = replay.blocks.map((block) => [
      block.name,
      block.lines[0],
      block.commands[0]?.command,
    ])
    expect(opening).toEqual([
      ['b1', lineOf('|move|p1a: Politoed|Scald'), 'SC_MOVE_MSG'],
      ['b2', lineOf('|move|p2a: Darmanitan|Roar'), 'SC_MOVE_MSG'],
      ['b3', lineOf('|drag|p1a: Ferrothorn'), 'SC_RECALL'],
      ['b4', lineOf('|switch|p2a: Blissey'), 'SC_RECALL_MSG'],
      ['b5', lineOf('|switch|p1a: Keldeo'), 'SC_RECALL_MSG'],
      ['b6', lineOf('|move|p1a: Keldeo|Secret Sword'), 'SC_MOVE_MSG'],
      ['b7', lineOf('|switch|p2a: Volcarona'), 'SC_OP_SETUP_ILLUSION'],
    ])
  })

  it('close the faint’s block with the fainted line and the faint', () => {
    const faint = replay.blocks[5]?.commands.map((one) => one.command)
    expect(faint?.slice(-2)).toEqual(['SC_MSG_SET', 'SC_FAINT'])
    expect(replay.blocks[5]?.lines).toContain(lineOf('|faint|p2a: Blissey'))
  })

  it('send each Pokémon in with SC_OP_SEND_IN and SC_SEND_OUT', () => {
    const sendIns = replay.blocks.map(
      (block) => block.commands.filter((one) => one.command === 'SC_OP_SEND_IN').length,
    )
    expect(sendIns).toEqual([0, 0, 1, 1, 1, 0, 1])
  })

  it('list no event of the hand turns', () => {
    const turn = lineOf('|turn|1')
    expect(replay.fallbacks.filter((one) => one.line >= turn)).toEqual([])
  })
})
