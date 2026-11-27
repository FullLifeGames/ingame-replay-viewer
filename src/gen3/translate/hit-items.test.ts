// Items whose lines the game says after the hit that used them (#105, D8): Focus Sash, which Showdown
// logs before the hit's `-damage` and the game says as the hit's result (`Cmd_resultmessage`,
// `BattleScript_HangedOnMsg`), and a berry that weakens a hit (`[weaken]`), which the game says in
// `MoveEndResistBerryMessage` after the hit's lines (`BattleScript_BerryReduceDmg`).
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { itemOf } from '../tables/lookup'
import { plain, streamOfLog } from '../testing'

/** The instructions of the log lines from `first` on, with plain spaces, without the END. */
const sceneFrom = (result: ReturnType<typeof streamOfLog>, first: number) =>
  result.instructions
    .filter(({ line, instruction }) => line >= first && instruction.op !== 'end')
    .map(({ instruction }) => plain(instruction))

/** The scene from the hit's HIT on. */
const fromHit = (result: ReturnType<typeof streamOfLog>) => {
  const scene = sceneFrom(result, NEXT)
  return scene.slice(scene.findIndex((step) => typeof step !== 'string' && step.op === 'hit'))
}

const fallbacksFrom = (result: ReturnType<typeof streamOfLog>, first: number) =>
  result.fallbacks.filter(({ line }) => line >= first)

const BRICK_BREAK = '|move|p1a: Dugtrio|Brick Break|p2a: Tyranitar'
const SUPER = '|-supereffective|p2a: Tyranitar'
const SASH = '|-enditem|p2a: Tyranitar|Focus Sash'
const HUNG_ON = 'The opposing Tyranitar hung on using its Focus Sash!'
const SUPER_LINE = "It's super effective!"
const ITEM_GONE = { op: 'item', side: 'far', slot: 0, item: 0 }

describe('Focus Sash (#105, D8)', () => {
  it('says the holder hung on after the bar and clears the item, then the effectiveness', () => {
    const result = streamOfLog(BRICK_BREAK, SUPER, SASH, '|-damage|p2a: Tyranitar|1/100')
    const scene = fromHit(result)
    expect(scene[0]).toEqual({ op: 'hit', side: 'far', effectiveness: 'super' })
    expect(scene[1]).toMatchObject({ op: 'hp', side: 'far' })
    expect(scene.slice(2)).toEqual([HUNG_ON, ITEM_GONE, SUPER_LINE])
    expect(fallbacksFrom(result, NEXT)).toEqual([])
  })

  it('says it after the critical hit line', () => {
    const result = streamOfLog(
      BRICK_BREAK,
      SUPER,
      '|-crit|p2a: Tyranitar',
      SASH,
      '|-damage|p2a: Tyranitar|1/100',
    )
    expect(fromHit(result).slice(2)).toEqual(['A critical hit!', HUNG_ON, ITEM_GONE, SUPER_LINE])
  })
})

describe('a berry that weakens a hit (#105, D8)', () => {
  it('shows the berry as it is eaten, then says it lessened the damage after the hit', () => {
    const result = streamOfLog(
      BRICK_BREAK,
      SUPER,
      '|-enditem|p2a: Tyranitar|Chople Berry|[eat]',
      '|-enditem|p2a: Tyranitar|Chople Berry|[weaken]',
      '|-damage|p2a: Tyranitar|32/100',
    )
    const scene = sceneFrom(result, NEXT)
    const hit = scene.findIndex((step) => typeof step !== 'string' && step.op === 'hit')
    expect(scene.slice(hit - 3, hit)).toEqual([
      { op: 'itemPopUp', side: 'far', item: itemOf('Chople Berry').number },
      { op: 'anim', side: 'far', anim: 'heldItemBerry' },
      ITEM_GONE,
    ])
    expect(fromHit(result).slice(2)).toEqual([
      SUPER_LINE,
      "The opposing Tyranitar's Chople Berry lessened the damage it took!",
    ])
    expect(fallbacksFrom(result, NEXT)).toEqual([])
  })
})

describe('an item end that no hit follows', () => {
  it('says its line where the log has it', () => {
    const result = streamOfLog(SASH, '|-enditem|p2a: Tyranitar|Chople Berry|[weaken]')
    expect(sceneFrom(result, NEXT)).toEqual([
      HUNG_ON,
      ITEM_GONE,
      "The opposing Tyranitar's Chople Berry lessened the damage it took!",
    ])
  })
})
