import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildGen5Replay } from '../src/gen5/backend/replay'
import { buildBattleScript } from '../src/script/build'
import { readReplay } from '../src/script/replay'
import { EFFECTS_TURNS } from './gen5-moment-effects'
import { handLog } from './gen5-moment-hits'
import { ROOMY_NUMBERS as ROOMY } from './gen5-moment-room.fixtures'
import { GEN5_PATHS } from './gen5-paths'

const ID = 'smogtours-gen5ou-862240'
const LOG = readReplay(JSON.parse(readFileSync(`${GEN5_PATHS.replays}/${ID}.json`, 'utf8'))).log
const EFFECTS = handLog(LOG, EFFECTS_TURNS)
const LINES = EFFECTS.split('\n')
/** The first line of the effects log that starts with `text`. */
const lineOf = (text: string) => LINES.findIndex((line) => line.startsWith(text))
/** Every line of the effects log that starts with `text`. */
const linesOf = (text: string) => LINES.flatMap((line, i) => (line.startsWith(text) ? [i] : []))

// Scene: the scene run of #109 plays six hand turns after the test replay's start, Breloom on the
// near side against Landorus. Turn 1: Stealth Rock lands on the near side, Breloom makes a
// Substitute, and its Toxic Orb poisons it. Turn 2: Earthquake breaks the doll, and Poison Heal
// heals Breloom. Turn 3: Starmie comes in for Landorus, Tyranitar for Breloom, with Stealth Rock's
// hit and Sand Stream's sandstorm, which buffets Starmie. Turn 4: Scald burns Tyranitar, Crunch
// hits Starmie, then sand, Leftovers and the burn. Turn 5: Landorus comes in with Intimidate.
// Turn 6: Tyranitar comes back burned.
describe('the effects turns', () => {
  it('start at the first turn and end with the burned Tyranitar’s Stealth Rock hit', () => {
    expect(EFFECTS_TURNS[0]).toBe('|turn|1')
    expect(EFFECTS_TURNS.at(-1)).toBe('|-damage|p1a: Tyranitar|40/100 brn|[from] Stealth Rock')
  })
})

describe('the effects turns as blocks', () => {
  const replay = buildGen5Replay(buildBattleScript(EFFECTS), ROOMY)
  const commandsOf = (i: number) => replay.blocks[i]?.commands.map((one) => one.command) ?? []

  it('give sixteen blocks in order, each opening with its first line and command', () => {
    const opening = replay.blocks.map((block) => [
      block.name,
      block.lines[0],
      block.commands[0]?.command,
    ])
    expect(opening).toEqual([
      ['b1', lineOf('|move|p2a: Landorus|Stealth Rock'), 'SC_MOVE_MSG'],
      ['b2', lineOf('|move|p1a: Breloom|Substitute'), 'SC_MOVE_MSG'],
      ['b3', lineOf('|-status|p1a: Breloom|tox'), 'SC_HIDE_MSG_WINDOW'],
      ['b4', lineOf('|move|p2a: Landorus|Earthquake'), 'SC_MOVE_MSG'],
      ['b5', lineOf('|-heal|p1a: Breloom'), 'SC_HIDE_MSG_WINDOW'],
      ['b6', lineOf('|switch|p2a: Starmie'), 'SC_RECALL_MSG'],
      ['b7', lineOf('|switch|p1a: Tyranitar|Tyranitar, F|100/100'), 'SC_RECALL_MSG'],
      ['b8', lineOf('|-damage|p2a: Starmie|94/100'), 'SC_HIDE_MSG_WINDOW'],
      ['b9', lineOf('|move|p2a: Starmie|Scald'), 'SC_MOVE_MSG'],
      ['b10', lineOf('|move|p1a: Tyranitar|Crunch'), 'SC_MOVE_MSG'],
      ['b11', lineOf('|-damage|p2a: Starmie|34/100'), 'SC_HIDE_MSG_WINDOW'],
      ['b12', lineOf('|-heal|p1a: Tyranitar'), 'SC_USE_HELD_ITEM'],
      ['b13', lineOf('|-damage|p1a: Tyranitar|46/100 brn|[from] brn'), 'SC_EFFECT_BY_POS'],
      ['b14', lineOf('|switch|p1a: Landorus'), 'SC_RECALL_MSG'],
      ['b15', lineOf('|-damage|p2a: Starmie|28/100'), 'SC_HIDE_MSG_WINDOW'],
      ['b16', lineOf('|switch|p1a: Tyranitar|Tyranitar, F|46/100'), 'SC_RECALL_MSG'],
    ])
  })

  it('play each effect in its block', () => {
    const effects: [number, string[]][] = [
      [1, ['SC_SUBSTITUTE_CREATE']],
      [2, ['SC_SET_GAUGE_STATUS']],
      [3, ['SC_DAMAGE_EFFECT', 'SC_SUBSTITUTE_DELETE']],
      [4, ['SC_ABILITY_POPUP_IN', 'SC_ABILITY_POPUP_OUT']],
      [6, ['SC_ABILITY_POPUP_IN', 'SC_WEATHER_START']],
      [7, ['SC_EFFECT']],
      [8, ['SC_SET_GAUGE_STATUS']],
      [13, ['SC_ABILITY_POPUP_IN', 'SC_STAT_DOWN_EFFECT']],
    ]
    for (const [i, commands] of effects)
      expect(commandsOf(i)).toEqual(expect.arrayContaining(commands))
  })

  it('show the Substitute’s HP drop in its block and the Stealth Rock hits in the switches', () => {
    expect(replay.blocks[1]?.lines).toContain(lineOf('|-damage|p1a: Breloom|75/100'))
    const rocks = linesOf('|-damage|p1a: Tyranitar').filter((at) =>
      LINES[at]?.endsWith('[from] Stealth Rock'),
    )
    expect(
      rocks.map((at) => replay.blocks.find((block) => block.lines.includes(at))?.name),
    ).toEqual(['b7', 'b16'])
  })

  it('list no effect for later: only the sand’s turns, which Black 2 shows nothing for, and the form', () => {
    const turn = lineOf('|turn|1')
    const listed = replay.fallbacks.filter((one) => one.line >= turn)
    expect(listed.filter((one) => one.kind === 'later')).toEqual([])
    expect(listed.map((one) => [one.line, one.kind])).toEqual(
      [
        ...linesOf('|-weather|Sandstorm|[upkeep]').map((at) => [at, 'line']),
        [lineOf('|switch|p1a: Landorus'), 'form'],
      ].sort(([a], [b]) => Number(a) - Number(b)),
    )
  })
})
