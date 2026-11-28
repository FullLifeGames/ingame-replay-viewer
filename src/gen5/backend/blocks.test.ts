import { describe, expect, it } from 'vitest'

import type { ScriptEvent } from '../../script/events.ts'
import { NEXT, scriptOf } from '../../script/testing.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { type Action, actionsOf, blocksOf, type Written } from './blocks.ts'
import { writeScript } from './moves.ts'
import { printedCommand } from './printed.ts'
import { REPLAY_NUMBERS } from './replay.fixtures.ts'

// A turn of two moves, then the residual lines after the spacer before `|upkeep`.
const TURN = scriptOf(
  '|turn|1',
  '|',
  '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
  '|-supereffective|p2a: Tyranitar',
  '|-damage|p2a: Tyranitar|40/100',
  '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
  '|-damage|p1a: Dugtrio|50/100',
  '|',
  '|-damage|p1a: Dugtrio|44/100|[from] Sandstorm',
  '|-heal|p2a: Tyranitar|46/100|[from] item: Leftovers',
  '|upkeep',
  '|switch|p1a: Skarmory|Skarmory, M|100/100',
  '|-damage|p1a: Skarmory|88/100|[from] Stealth Rock',
  '|turn|2',
)

const shownAction = (action: Action) => action.map((event) => `${event.kind} ${String(event.line)}`)

// Invented commands by event kind, each argument a halfword in the fixture's formats: a move's
// line packs to 6 bytes, an HP change to 6, the bar to 4.
const gauge: ServerCommand = { command: 'SC_UPDATE_HP_GAUGE', args: [1] }
const carrier = printedCommand(REPLAY_NUMBERS)
function commandsOf(event: ScriptEvent): ServerCommand[] {
  if (event.kind === 'move') return [{ command: 'SC_MOVE_MSG', args: [1, 89] }]
  if (event.kind === 'damage') return [{ command: 'SC_OP_SUBTRACT_HP', args: [1, 10] }, gauge]
  if (event.kind === 'heal') return [{ command: 'SC_OP_ADD_HP', args: [1, 6] }, gauge]
  return []
}
/** Each event's commands; a message prints its text on one page. */
const writtenOf = (actions: readonly Action[]): Written[][] =>
  actions.map((action) =>
    action.map((event) =>
      event.kind === 'message'
        ? { line: event.line, commands: [carrier], pages: [event.text] }
        : { line: event.line, commands: commandsOf(event) },
    ),
  )

const ROOM = { table: REPLAY_NUMBERS, room: 32 }

// Scene: each move of a turn plays as one block, each residual line as a block of its own.
describe('actionsOf', () => {
  it('opens an action at each move and a switch-in after the leads, and closes it at a turn', () => {
    const actions = actionsOf(TURN).filter((action) => action.some((e) => e.line >= NEXT))
    expect(actions.map(shownAction)).toEqual([
      [`turn ${String(NEXT)}`],
      [`move ${String(NEXT + 2)}`, `damage ${String(NEXT + 4)}`],
      [`move ${String(NEXT + 5)}`, `damage ${String(NEXT + 6)}`],
      [`damage ${String(NEXT + 8)}`],
      [`heal ${String(NEXT + 9)}`],
      [`switchIn ${String(NEXT + 11)}`, `damage ${String(NEXT + 12)}`],
      [`turn ${String(NEXT + 13)}`],
    ])
  })

  // #118: a printed line is an action of its own. Amid a move it waits for the move's action to
  // end, so the hit plays with its move.
  it("prints a line amid a move after the move's action, before the next one", () => {
    const script = scriptOf(
      '|turn|1',
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|message|Bob forfeited.',
      '|-damage|p2a: Tyranitar|40/100',
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|message|Carol forfeited.',
      '|turn|2',
    )
    const actions = actionsOf(script).filter((action) => action.some((e) => e.line > NEXT))
    expect(actions.map(shownAction)).toEqual([
      [`move ${String(NEXT + 1)}`, `damage ${String(NEXT + 3)}`],
      [`message ${String(NEXT + 2)}`],
      [`move ${String(NEXT + 4)}`],
      [`message ${String(NEXT + 5)}`],
      [`turn ${String(NEXT + 6)}`],
    ])
    const blocks = blocksOf(writtenOf(actions.slice(0, 2)), ROOM)
    expect(blocks.map((block) => [block.name, block.lines, block.print])).toEqual([
      ['b1', [NEXT + 1, NEXT + 3], undefined],
      ['b2', [NEXT + 2], 'Bob forfeited.'],
    ])
    expect(blocks[1]?.commands).toEqual([carrier])
  })

  // The writer reads each event by its place in the script, whatever the action's order.
  it("writes a move's hit with a printed line amid them as without it", () => {
    const move = '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar'
    const hit = '|-damage|p2a: Tyranitar|40/100'
    const commandsOf = (...log: string[]) =>
      writeScript(scriptOf('|turn|1', ...log), REPLAY_NUMBERS)
        .actions.flat()
        .filter((written) => written.pages === undefined)
        .map((written) => written.commands)
    const amid = commandsOf(move, '|message|Bob forfeited.', hit)
    expect(amid).toEqual(commandsOf(move, hit))
    expect(amid.flat().length > 2).toBe(true)
  })

  it('keeps each event of the intro and each lead apart', () => {
    const before = actionsOf(TURN).filter((action) => action.every((e) => e.line < NEXT))
    expect(before.every((action) => action.length === 1)).toBe(true)
    expect(before.flat().map((event) => event.kind)).toEqual([
      'player',
      'player',
      'teamSize',
      'teamSize',
      'battleStart',
      'switchIn',
      'switchIn',
    ])
  })

  it('opens an action at a cant, and takes the lines of a turn with no upkeep by action', () => {
    const script = scriptOf(
      '|turn|1',
      '|cant|p1a: Dugtrio|par',
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|',
      '|-damage|p1a: Dugtrio|44/100|[from] Sandstorm',
    )
    const actions = actionsOf(script).filter((action) => action.some((e) => e.line > NEXT))
    expect(actions.map(shownAction)).toEqual([
      [`cant ${String(NEXT + 1)}`],
      [`move ${String(NEXT + 2)}`, `damage ${String(NEXT + 4)}`],
    ])
  })
})

describe('blocksOf', () => {
  it('names a block per action that writes, in replay order, with the lines that wrote', () => {
    const blocks = blocksOf(writtenOf(actionsOf(TURN)), ROOM)
    expect(blocks.map((block) => [block.name, block.lines])).toEqual([
      ['b1', [NEXT + 2, NEXT + 4]],
      ['b2', [NEXT + 5, NEXT + 6]],
      ['b3', [NEXT + 8]],
      ['b4', [NEXT + 9]],
      ['b5', [NEXT + 12]],
    ])
    expect(blocks[0]?.commands.map((one) => one.command)).toEqual([
      'SC_MOVE_MSG',
      'SC_OP_SUBTRACT_HP',
      'SC_UPDATE_HP_GAUGE',
    ])
  })

  it('makes no block of an action whose events write no command', () => {
    const silent = actionsOf(TURN).map((action) =>
      action.map((event) => ({ line: event.line, commands: [] })),
    )
    expect(blocksOf(silent, ROOM)).toEqual([])
  })

  // Lane plan D10: a Substitute's start writes its HP drop, so the drop's line shows in its block.
  it('adds the lines a write shows besides its own to its block', () => {
    const written: Written[][] = [
      [
        { line: 7, commands: [gauge], shows: [8] },
        { line: 8, commands: [] },
        { line: 9, commands: [gauge] },
      ],
    ]
    expect(blocksOf(written, ROOM).map((block) => block.lines)).toEqual([[7, 8, 9]])
  })

  // Lane plan D4: each page of a printed line is a block of its own, the carrier alone, and the
  // commands around it keep their blocks.
  it('makes a block of each printed page, never packed with other commands', () => {
    const written: Written[][] = [
      [
        { line: 7, commands: [gauge] },
        { line: 8, commands: [carrier], pages: ['Rain\nSun\nHail', 'Sand'] },
        { line: 9, commands: [gauge] },
      ],
    ]
    expect(blocksOf(written, ROOM)).toEqual([
      { name: 'b1', lines: [7], commands: [gauge] },
      { name: 'b2', lines: [8], commands: [carrier], print: 'Rain\nSun\nHail' },
      { name: 'b3', lines: [8], commands: [carrier], print: 'Sand' },
      { name: 'b4', lines: [9], commands: [gauge] },
    ])
  })

  // Scene: an action that the client's queue cannot hold in one block.
  it('splits an action between commands past the room', () => {
    const blocks = blocksOf(writtenOf(actionsOf(TURN)), { ...ROOM, room: 12 })
    expect(blocks.slice(0, 2).map((block) => [block.name, block.lines, block.commands])).toEqual([
      [
        'b1',
        [NEXT + 2, NEXT + 4],
        [
          { command: 'SC_MOVE_MSG', args: [1, 89] },
          { command: 'SC_OP_SUBTRACT_HP', args: [1, 10] },
        ],
      ],
      ['b2', [NEXT + 4], [gauge]],
    ])
  })

  it('fails by name on a command that alone passes the room', () => {
    expect(() => blocksOf(writtenOf(actionsOf(TURN)), { ...ROOM, room: 5 })).toThrow(
      `SC_MOVE_MSG (line ${String(NEXT + 2)}) packs to 6 bytes; a block holds 5`,
    )
  })
})
