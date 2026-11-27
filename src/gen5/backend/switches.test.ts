import { describe, expect, it } from 'vitest'

import { NEXT, scriptOf } from '../../script/testing.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import { writeScript } from './moves.ts'
import { buildGen5Replay } from './replay.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'
import { NO_LINE, SHOW_LINE } from './switches.ts'

// The invented battle of REPLAY_NUMBERS: Alice's client 3 holds Dugtrio, mon ID 40, at position
// 0; Bob's client 2 holds Tyranitar, mon ID 10, at position 1. Each side's Pokémon take the mon
// IDs of their party slots in the order of their first switch-in: Alice's Skarmory is 41, Bob's
// 11. Line NEXT is `|turn|1`.
const NEAR = { client: 3, pos: 0 }
const FAR = { client: 2, pos: 1 }
const { switchOut: SWITCH_OUT, drag: DRAG } = NUMBERS.flow.switchEffects

const cmd = (command: string, ...args: number[]): ServerCommand => ({ command, args })

/** ServerDisplay_RecallMessage, then ServerControl_SwitchOutCore. */
const recall = (side: typeof NEAR, monId: number) => [
  cmd('SC_RECALL_MSG', side.client, monId),
  cmd('SC_RECALL', side.pos, SWITCH_OUT),
  cmd('SC_OP_CLEAR_FOR_SWITCH', monId),
]

/** ServerControl_SwitchInFillSlot: ServerControl_SwitchInCore's commands, then SC_SEND_OUT. */
const sendIn = (side: typeof NEAR, slot: number, turn: number, show = SHOW_LINE) => [
  cmd('SC_OP_SETUP_ILLUSION', side.client),
  cmd('SC_OP_SEND_IN', side.client, 0, slot, turn),
  cmd('SC_SEND_OUT', side.client, 0, slot, show),
]

const draggedOut = (monId: number): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(NUMBERS.text, GEN5_LINES.draggedOut),
  args: [monId],
})

/** What the short log `|turn|1` and `lines` writes for the event of log line `NEXT + at`, and
 * the writer's fallbacks. */
function writtenAt(at: number, ...lines: string[]) {
  const { actions, fallbacks } = writeScript(scriptOf('|turn|1', ...lines), NUMBERS)
  const commands = actions
    .flat()
    .flatMap((event) => (event.line === NEXT + at ? event.commands : []))
  return { commands, fallbacks }
}

const SKARMORY_IN = '|switch|p1a: Skarmory|Skarmory, M|100/100'

// Scene: a trainer calls a Pokémon back and sends another out, as ServerControl_ChangePokemon
// does: the recall line, the recall and the switch's clearing, then the send-in with its line.
describe('a switch by choice', () => {
  it('calls the near lead back and sends Skarmory in from its party slot', () => {
    expect(writtenAt(1, SKARMORY_IN)).toEqual({
      commands: [...recall(NEAR, 40), ...sendIn(NEAR, 1, 1)],
      fallbacks: [],
    })
  })

  it('calls the far lead back and sends Skarmory in, with the turn of the log', () => {
    expect(writtenAt(2, '|turn|2', '|switch|p2a: Skarmory|Skarmory, M|100/100')).toEqual({
      commands: [...recall(FAR, 10), ...sendIn(FAR, 1, 2)],
      fallbacks: [],
    })
  })
})

// Scene: U-turn hits and its user goes back. The switch plays as a plain one (lane plan D2):
// the game's own recall line where BattleHandler_Switch would print the handler's.
describe('a switch after U-turn', () => {
  it('plays as a plain switch, with nothing listed', () => {
    const lines = [
      '|move|p1a: Dugtrio|U-turn|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|80/100',
      `${SKARMORY_IN}|[from] U-turn`,
    ]
    expect(writtenAt(3, ...lines)).toEqual({
      commands: [...recall(NEAR, 40), ...sendIn(NEAR, 1, 1)],
      fallbacks: [],
    })
  })
})

// Scene: Tyranitar drags Dugtrio out, as ServerControl_ForceSwitchCore does: the recall with the
// drag's effect and no line, the send-in without its line, then the drag's line (lane plan D4).
describe('a drag', () => {
  const DRAG_IN = '|drag|p1a: Skarmory|Skarmory, M|100/100'
  const DRAGGED = [
    cmd('SC_RECALL', NEAR.pos, DRAG),
    cmd('SC_OP_CLEAR_FOR_SWITCH', 40),
    ...sendIn(NEAR, 1, 1, NO_LINE),
    draggedOut(41),
  ]

  it('plays a drag by Roar with nothing listed', () => {
    expect(writtenAt(2, '|move|p2a: Tyranitar|Roar|p1a: Dugtrio', DRAG_IN)).toEqual({
      commands: DRAGGED,
      fallbacks: [],
    })
  })

  it('plays a drag after Dragon Tail with Roar’s look, and lists it as a plain switch', () => {
    const lines = ['|move|p2a: Tyranitar|Dragon Tail|p1a: Dugtrio', '|-damage|p1a: Dugtrio|80/100']
    expect(writtenAt(3, ...lines, DRAG_IN)).toEqual({
      commands: DRAGGED,
      fallbacks: [
        {
          line: NEXT + 3,
          kind: 'plain',
          event: 'switchIn',
          detail: 'plays as a plain switch: the look of the drag after Dragon Tail',
        },
      ],
    })
  })

  it('lists a drag that no move came before as a plain switch', () => {
    expect(writtenAt(1, DRAG_IN).fallbacks).toEqual([
      {
        line: NEXT + 1,
        kind: 'plain',
        event: 'switchIn',
        detail: 'plays as a plain switch: the look of the drag',
      },
    ])
  })
})

// Scene: Dugtrio passes its stat stages to Skarmory. The switch plays as a plain one, and the
// stages it carries wait (lane plan D3).
describe('a switch by Baton Pass', () => {
  it('plays as a plain switch and lists the stat stages it carries', () => {
    const lines = ['|move|p1a: Dugtrio|Baton Pass|p1a: Dugtrio', `${SKARMORY_IN}|[from] Baton Pass`]
    expect(writtenAt(2, ...lines)).toEqual({
      commands: [...recall(NEAR, 40), ...sendIn(NEAR, 1, 1)],
      fallbacks: [
        {
          line: NEXT + 2,
          kind: 'plain',
          event: 'switchIn',
          detail: 'plays as a plain switch: the stat stages Baton Pass carries',
        },
      ],
    })
  })
})

// Scene: Dugtrio faints and Alice sends Skarmory into the empty place, as
// BtlServerFlow_RunFaintSwitch does: the send-in with its line and no recall.
describe('a send-in after a faint', () => {
  it('sends Skarmory in alone', () => {
    const lines = [
      '|move|p2a: Tyranitar|Earthquake|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|0 fnt',
      '|faint|p1a: Dugtrio',
      '|',
      '|upkeep',
      SKARMORY_IN,
    ]
    expect(writtenAt(6, ...lines).commands).toEqual(sendIn(NEAR, 1, 1))
  })
})

// Scene: Skarmory leaves at 60 and comes back at 93, as Regenerator brings it (lane plan D6):
// the game's HP follows the log's before the send-in, and the box draws at the send-out.
describe('a switch-in at another HP than it left with', () => {
  it('sends the HP op of the incoming Pokémon first', () => {
    const lines = [
      SKARMORY_IN,
      '|turn|2',
      '|move|p2a: Tyranitar|Rock Slide|p1a: Skarmory',
      '|-damage|p1a: Skarmory|60/100',
      '|turn|3',
      '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
      '|turn|4',
      '|switch|p1a: Skarmory|Skarmory, M|93/100',
    ]
    expect(writtenAt(8, ...lines).commands).toEqual([
      ...recall(NEAR, 40),
      cmd('SC_OP_ADD_HP', 41, 33),
      ...sendIn(NEAR, 1, 4),
    ])
  })
})

// Scene: Alice sends in Skarmory (mon ID 41), then Gengar (42), then Dugtrio (40) again. Each
// send-in swaps the front with the incoming Pokémon's slot (BattleParty_Swap), so Dugtrio comes
// back from slot 1, where Skarmory's send-in put it.
describe('three swaps on one side', () => {
  const lines = [
    SKARMORY_IN,
    '|turn|2',
    '|switch|p1a: Gengar|Gengar, M|100/100',
    '|turn|3',
    '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
  ]

  it('sends each in from its slot and calls back the Pokémon the last swap placed', () => {
    expect([1, 3, 5].map((at) => writtenAt(at, ...lines).commands)).toEqual([
      [...recall(NEAR, 40), ...sendIn(NEAR, 1, 1)],
      [...recall(NEAR, 41), ...sendIn(NEAR, 2, 2)],
      [...recall(NEAR, 42), ...sendIn(NEAR, 1, 3)],
    ])
  })
})

// Scene: the six commands of a switch pack past the invented room of 0x20 bytes, so the switch
// splits between commands into two blocks, both of its line.
describe('a switch past the room of a block', () => {
  it('splits between commands', () => {
    const replay = buildGen5Replay(scriptOf('|turn|1', SKARMORY_IN), NUMBERS)
    const blocks = replay.blocks.filter((block) => block.lines.includes(NEXT + 1))
    expect(blocks.map((block) => block.lines)).toEqual([[NEXT + 1], [NEXT + 1]])
    expect(blocks.map((block) => block.commands)).toEqual([
      [...recall(NEAR, 40), ...sendIn(NEAR, 1, 1).slice(0, 2)],
      sendIn(NEAR, 1, 1).slice(2),
    ])
  })
})
