import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { animGap } from '../fallbacks'
import { moveOf } from '../tables/lookup'
import { plain, streamOfLog } from '../testing'

// Showdown names a move's look with `[anim]` (`attrLastMove`, data/moves.ts): Ivy Cudgel's,
// Tera Blast's, Shell Side Arm's and Fickle Beam's looks of their own, or a real move, as a
// Z-Move names its base move (sim/battle-actions.ts). The MOVE op carries one move number.
describe("a move line's [anim]", () => {
  it("plays the move's own animation for a look the game lacks, and lists the look", () => {
    const result = streamOfLog(
      '|move|p1a: Dugtrio|Ivy Cudgel|p2a: Tyranitar|[anim] Ivy Cudgel Water',
    )
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      'Dugtrio used Ivy Cudgel!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Ivy Cudgel').number, animTurn: 0 },
      { op: 'end', outcome: 'unknown' },
    ])
    const detail = 'the game has no look for Ivy Cudgel Water; it plays Ivy Cudgel'
    expect(animGap('Ivy Cudgel Water', 'Ivy Cudgel')).toEqual({ kind: 'move', detail })
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([
      { line: NEXT, kind: 'move', detail },
    ])
  })

  it('plays the animation of the real move it names, with the first move in the line', () => {
    const result = streamOfLog('|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[anim] Tackle')
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      'Dugtrio used Earthquake!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Tackle').number, animTurn: 0 },
      { op: 'end', outcome: 'unknown' },
    ])
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })
})
