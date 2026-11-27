import { describe, expect, it } from 'vitest'

import { NEXT, scriptOf } from '../../script/testing.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import { writeScript } from './moves.ts'
import { gen5Item, gen5Move } from './names.ts'
import { buildGen5Replay } from './replay.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Alice's Dugtrio, mon ID 40, stands at position 0, and
// Bob's Tyranitar, mon ID 10, at position 1. Line NEXT is `|turn|1`.
const DUGTRIO = { monId: 40, pos: 0 }
const TYRANITAR = { monId: 10, pos: 1 }
const KINDS = NUMBERS.flow.damageKinds

const msgStd = (line: keyof typeof GEN5_LINES): ServerCommand => ({
  command: 'SC_MSG_STD',
  message: lineId(NUMBERS.text, GEN5_LINES[line]),
  args: [],
})
const msgSet = (line: keyof typeof GEN5_LINES, ...args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_LINES[line]),
  args,
})
const moveMsg = (user: number, move: string): ServerCommand => ({
  command: 'SC_MOVE_MSG',
  args: [user, gen5Move(move)],
})
const moveAnim = (user: number, target: number, move: string): ServerCommand => ({
  command: 'SC_MOVE_ANIM',
  args: [user, target, gen5Move(move), 0],
})
const flash = (kind: number, move: string, monId: number): ServerCommand => ({
  command: 'SC_DAMAGE_PLURAL',
  args: [1, kind, gen5Move(move)],
  bytes: [monId],
})
const subtract = (monId: number, amount: number) => ({
  command: 'SC_OP_SUBTRACT_HP',
  args: [monId, amount],
})

/** The replay of the short log `|turn|1` and `lines`. */
const replayOf = (...lines: string[]) => buildGen5Replay(scriptOf('|turn|1', ...lines), NUMBERS)

/** Every command the short log's actions write, in order. */
const commandsOf = (...lines: string[]) =>
  writeScript(scriptOf('|turn|1', ...lines), NUMBERS).actions.flatMap((action) =>
    action.flatMap((event) => event.commands),
  )

/** The replay's fallbacks of events, by kind, line and detail. */
const eventFallbacks = (...lines: string[]) =>
  replayOf(...lines).fallbacks.flatMap((one) =>
    one.kind === 'later' || one.kind === 'line'
      ? [`${one.event} ${String(one.line - NEXT)} ${one.detail}`]
      : [],
  )

// Scene: Dugtrio's Earthquake hits Tyranitar, which drops from 100 to 60. The server sends the
// move's line, its animation, the HP drop and the flash with the plain hit's sound.
describe('a plain hit', () => {
  it('sends the move line, the animation, the HP drop and the flash of the plain kind', () => {
    const lines = ['|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar', '|-damage|p2a: Tyranitar|60/100']
    expect(commandsOf(...lines)).toEqual([
      moveMsg(DUGTRIO.monId, 'Earthquake'),
      moveAnim(DUGTRIO.pos, TYRANITAR.pos, 'Earthquake'),
      subtract(TYRANITAR.monId, 40),
      flash(KINDS.plain, 'Earthquake', TYRANITAR.monId),
    ])
    expect(eventFallbacks(...lines)).toEqual([])
  })
})

// Scene: a critical, super effective Earthquake. The effectiveness line comes before the
// critical hit's line, as ServerControl_DamageListCore sends them.
describe('a critical, super effective hit', () => {
  it('flashes with the super kind, then says it is super effective, then that it was critical', () => {
    expect(
      commandsOf(
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
        '|-crit|p2a: Tyranitar',
        '|-supereffective|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|10/100',
      ),
    ).toEqual([
      moveMsg(DUGTRIO.monId, 'Earthquake'),
      moveAnim(DUGTRIO.pos, TYRANITAR.pos, 'Earthquake'),
      subtract(TYRANITAR.monId, 90),
      flash(KINDS.super, 'Earthquake', TYRANITAR.monId),
      msgStd('superEffective'),
      msgStd('critical'),
    ])
  })
})

// Scene: Tyranitar's Rock Slide on Dugtrio is resisted.
describe('a resisted hit', () => {
  it('flashes with the resisted kind and says it is not very effective', () => {
    expect(
      commandsOf(
        '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
        '|-resisted|p1a: Dugtrio',
        '|-damage|p1a: Dugtrio|70/100',
      ),
    ).toEqual([
      moveMsg(TYRANITAR.monId, 'Rock Slide'),
      moveAnim(TYRANITAR.pos, DUGTRIO.pos, 'Rock Slide'),
      subtract(DUGTRIO.monId, 30),
      flash(KINDS.resisted, 'Rock Slide', DUGTRIO.monId),
      msgStd('notVeryEffective'),
    ])
  })
})

// Scene: Rock Slide misses. The server leaves the reserved animation empty and names the target
// that avoided it.
describe('a miss', () => {
  it('sends the move line and the avoided line with the target’s mon ID, and no animation', () => {
    const lines = [
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio|[miss]',
      '|-miss|p2a: Tyranitar|p1a: Dugtrio',
    ]
    expect(commandsOf(...lines)).toEqual([
      moveMsg(TYRANITAR.monId, 'Rock Slide'),
      msgSet('avoided', DUGTRIO.monId),
    ])
    expect(eventFallbacks(...lines)).toEqual([])
  })
})

// Scene: Dugtrio's Protect fails.
describe('a failed move', () => {
  it('sends the move line and the failure line, and no animation', () => {
    expect(
      commandsOf('|move|p1a: Dugtrio|Protect|p1a: Dugtrio|[still]', '|-fail|p1a: Dugtrio'),
    ).toEqual([moveMsg(DUGTRIO.monId, 'Protect'), msgStd('failed')])
  })
})

// Scene: Tyranitar's Thunderbolt does not affect Dugtrio.
describe('an immunity', () => {
  it('sends the move line and the line that it does not affect the target, and no animation', () => {
    expect(
      commandsOf('|move|p2a: Tyranitar|Thunderbolt|p1a: Dugtrio', '|-immune|p1a: Dugtrio'),
    ).toEqual([moveMsg(TYRANITAR.monId, 'Thunderbolt'), msgSet('doesNotAffect', DUGTRIO.monId)])
  })
})

// Scene: after Earthquake took Tyranitar to 60, its Leftovers heal it to 66 at the turn's end.
// ServerControl_UseHeldItem reserves the item's command, ServerControl_RecoverHPCore shows the
// heal's effect and the bar, and the item handler's line follows.
describe('a heal by Leftovers', () => {
  it('plays in blocks of its own: the item, its effect, the HP, the bar and the line', () => {
    const replay = replayOf(
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|60/100',
      '|',
      '|-heal|p2a: Tyranitar|66/100|[from] item: Leftovers',
      '|upkeep',
      '|turn|2',
    )
    // The invented room of 0x20 bytes parts the five commands into two blocks; neither holds
    // another line.
    const heal = replay.blocks.filter((block) => block.lines.includes(NEXT + 4))
    expect(heal.map((block) => block.lines)).toEqual([[NEXT + 4], [NEXT + 4]])
    expect(heal.flatMap((block) => block.commands)).toEqual([
      { command: 'SC_USE_HELD_ITEM', args: [TYRANITAR.monId] },
      { command: 'SC_EFFECT_BY_POS', args: [TYRANITAR.pos, NUMBERS.flow.recoverEffect] },
      { command: 'SC_OP_ADD_HP', args: [TYRANITAR.monId, 6] },
      { command: 'SC_UPDATE_HP_GAUGE', args: [TYRANITAR.monId] },
      msgSet('leftovers', TYRANITAR.monId, gen5Item('Leftovers')),
    ])
    expect(replay.fallbacks.filter((one) => one.kind === 'later')).toEqual([])
  })
})

// Scene: Stealth Rock hurts a lead. Its line plays with #109; until then the bar moves the way
// ServerDisplay_SimpleHP moves it, with no line, so it stays at the log's HP.
describe('an HP change that does not play yet', () => {
  it('moves the bar of a Pokémon in place silently and lists its line', () => {
    const lines = ['|-damage|p2a: Tyranitar|88/100|[from] Stealth Rock']
    expect(commandsOf(...lines)).toEqual([
      subtract(TYRANITAR.monId, 12),
      { command: 'SC_UPDATE_HP_GAUGE', args: [TYRANITAR.monId] },
    ])
    expect(eventFallbacks(...lines)).toEqual(['damage 1 plays with #109'])
  })
})

// Scene: Bob sends in Skarmory, his team's second Pokémon and so mon ID 11, at position 1, and
// Dugtrio's Rock Slide hits it there.
describe('a hit on a Pokémon sent in', () => {
  it('names the Pokémon sent in by its own mon ID', () => {
    const lines = [
      '|switch|p2a: Skarmory|Skarmory, M|100/100',
      '|move|p1a: Dugtrio|Rock Slide|p2a: Skarmory',
      '|-damage|p2a: Skarmory|80/100',
    ]
    const skarmory = { monId: 11, pos: 1 }
    expect(commandsOf(...lines).slice(-4)).toEqual([
      moveMsg(DUGTRIO.monId, 'Rock Slide'),
      moveAnim(DUGTRIO.pos, skarmory.pos, 'Rock Slide'),
      subtract(skarmory.monId, 20),
      flash(KINDS.plain, 'Rock Slide', skarmory.monId),
    ])
    expect(eventFallbacks(...lines)).toEqual([])
  })
})
