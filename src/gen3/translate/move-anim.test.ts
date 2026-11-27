import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { animGap } from '../fallbacks'
import { moveOf, typeOf } from '../tables/lookup'
import { plain, streamOfLog } from '../testing'

// Showdown names a move's look with `[anim]` (`attrLastMove`, data/moves.ts): Ivy Cudgel's,
// Tera Blast's, Shell Side Arm's and Fickle Beam's looks of their own, or a real move, as a
// Z-Move names its base move (sim/battle-actions.ts). The MOVE op carries one move number; a look
// named by its type (Ivy Cudgel's, Tera Blast's) goes to the game as a MOVE_TYPE right before it.
describe("a move line's [anim]", () => {
  it.each([
    ['Ivy Cudgel', 'Water'],
    ['Tera Blast', 'Fire'],
  ])('gives %s the type of its look, %s, right before its MOVE', (name, type) => {
    const result = streamOfLog(`|move|p1a: Dugtrio|${name}|p2a: Tyranitar|[anim] ${name} ${type}`)
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(typeOf(type)).toBeDefined()
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      `Dugtrio used ${name}!`,
      { op: 'moveType', type: typeOf(type) },
      { op: 'move', user: 'near', target: 'far', move: moveOf(name).number, animTurn: 0 },
      { op: 'end', outcome: 'unknown' },
    ])
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
  })

  it.each([
    ['Shell Side Arm', 'Shell Side Arm Physical'],
    ['Fickle Beam', 'Fickle Beam All Out'],
  ])(
    "plays %s's own animation for a look whose last word is no type, and lists it",
    (name, look) => {
      const result = streamOfLog(`|move|p1a: Dugtrio|${name}|p2a: Tyranitar|[anim] ${look}`)
      const scene = result.instructions.filter(({ line }) => line >= NEXT)
      expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
        `Dugtrio used ${name}!`,
        { op: 'move', user: 'near', target: 'far', move: moveOf(name).number, animTurn: 0 },
        { op: 'end', outcome: 'unknown' },
      ])
      const detail = `the game has no look for ${look}; it plays ${name}`
      expect(animGap(look, name)).toEqual({ kind: 'move', detail })
      expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([
        { line: NEXT, kind: 'move', detail },
      ])
    },
  )

  it("writes no MOVE_TYPE for another move's look by type, and lists it", () => {
    const look = 'Tera Blast Fire'
    const result = streamOfLog(`|move|p1a: Dugtrio|Ivy Cudgel|p2a: Tyranitar|[anim] ${look}`)
    const scene = result.instructions.filter(({ line }) => line >= NEXT)
    expect(scene.map(({ instruction }) => plain(instruction))).toEqual([
      'Dugtrio used Ivy Cudgel!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Ivy Cudgel').number, animTurn: 0 },
      { op: 'end', outcome: 'unknown' },
    ])
    const detail = `the game has no look for ${look}; it plays Ivy Cudgel`
    expect(animGap(look, 'Ivy Cudgel')).toEqual({ kind: 'move', detail })
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([
      { line: NEXT, kind: 'move', detail },
    ])
  })

  it('writes no MOVE_TYPE for a move with no [anim]', () => {
    const result = streamOfLog('|move|p1a: Dugtrio|Ivy Cudgel|p2a: Tyranitar')
    const ops = result.instructions.filter(({ line }) => line >= NEXT)
    expect(ops.map(({ instruction }) => instruction.op)).toEqual(['print', 'move', 'end'])
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

  it('plays and lists the stand-in of a real move it names that the game lacks', () => {
    const result = streamOfLog('|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar|[anim] Paleo Wave')
    const ops = result.instructions.filter(({ line }) => line >= NEXT)
    expect(ops.map(({ instruction }) => plain(instruction))[1]).toEqual({
      op: 'move',
      user: 'near',
      target: 'far',
      move: moveOf('Paleo Wave').number,
      animTurn: 0,
    })
    const { fallback } = moveOf('Paleo Wave')
    expect(fallback).toBeDefined()
    expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([
      { line: NEXT, kind: 'move', detail: fallback?.detail },
    ])
  })

  it.each([
    ['[miss]', '|-miss|p1a: Dugtrio|p2a: Tyranitar'],
    ['[still]', '|-fail|p1a: Dugtrio'],
  ])(
    'notes no look and writes no MOVE_TYPE on a move with %s, which plays no animation',
    (flag, after) => {
      const result = streamOfLog(
        `|move|p1a: Dugtrio|Ivy Cudgel|p2a: Tyranitar|${flag}|[anim] Ivy Cudgel Water`,
        after,
      )
      const ops = result.instructions.filter(({ line }) => line >= NEXT)
      expect(ops.map(({ instruction }) => instruction.op)).not.toContain('move')
      expect(ops.map(({ instruction }) => instruction.op)).not.toContain('moveType')
      expect(result.fallbacks.filter(({ line }) => line >= NEXT)).toEqual([])
    },
  )
})
