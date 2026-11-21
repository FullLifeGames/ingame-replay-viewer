// The ball display of the intro (#21): one ball per member of a side's team, revealed or not, and
// an empty circle in each slot past the team size. The intro reads the display from the party
// (U/src/battle_main.c:3216-3245; U = .cache/rom/expansion at 79dd436), and the ROM fills each
// party up to the stream's team size (rom/gen3/src/replay_setup.c).
import { STREAM } from '../src/gen3/stream/format.ts'
import type { Stream } from '../src/gen3/stream/instructions.ts'
import type { Side } from '../src/script/types.ts'

import type { Region } from './rom-shot-probes.ts'
import type { Scene } from './rom-shot-scenes.ts'

// A ball is an 8x8 sprite, 10 pixels from the next (CreatePartyStatusSummarySprites,
// U/src/battle_interface.c:1299). Near: bar_X 136 and bar_Y 96 (:1313-1318), the balls at
// bar_Y - 4 (:1376) and x + 10i + 24 (:1391). Far: bar_X 104 and bar_Y 40 (:1327-1329), the balls
// at x - 10(5 - i) - 24 (:1397). Corners measured on the frame before the first SEND_OUT of 994052
// (plan step 0, frame balls-d2): near cells at (156 + 10i, 88), far cells at (26 + 10i, 32).
const CELL = 8
const PITCH = 10
const FIRST_CELL: Readonly<Record<Side, { x: number; y: number }>> = {
  near: { x: 156, y: 88 },
  far: { x: 26, y: 32 },
}

// The order in which a side's balls fill its cells: near balls from the left, far balls from the
// right, empty circles after them (U/src/battle_interface.c:1431-1458 and :1487-1512).
function cellsOf(side: Side): Region[] {
  const { x, y } = FIRST_CELL[side]
  return Array.from({ length: STREAM.partySize }, (_, i) => {
    const column = side === 'near' ? i : STREAM.partySize - 1 - i
    return { x: x + PITCH * column, y, width: CELL, height: CELL }
  })
}

// The top colour of a ball, which the empty circle lacks. Measured on the same frame.
const BALL_COLOUR = 0xf79473

// The ROM's rule: the revealed mons stay, and the party fills up to the team size, at most a full
// party.
function ballsOf(stream: Stream, side: Side): number {
  const revealed = stream.parties[side].filter((mon) => mon !== null).length
  return Math.max(revealed, Math.min(stream.trainers[side].teamSize, STREAM.partySize))
}

/** The side's ball display on the frame before the first SEND_OUT, where both displays are up. */
export function ballScene(stream: Stream, side: Side): Scene | undefined {
  const at = stream.instructions.findIndex((instruction) => instruction.op === 'sendOut')
  if (at < 0) return undefined
  const name = `${side}-balls`
  return {
    name,
    shots: [{ name, done: at, frames: 0 }],
    check: {
      probe: 'balls',
      shot: name,
      cells: cellsOf(side),
      colour: BALL_COLOUR,
      balls: ballsOf(stream, side),
    },
  }
}
