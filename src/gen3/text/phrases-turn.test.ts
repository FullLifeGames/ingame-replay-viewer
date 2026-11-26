import { describe, expect, it } from 'vitest'

import { blocked, singleTurn } from './phrases-turn'
import { sceneOf } from './testing'

const NBSP = '\u00a0'

describe('an effect for one turn, and a block (P1)', () => {
  it.each([
    ['p1a: Dugtrio|Protect', 'Dugtrio protected itself!'],
    ['p1a: Dugtrio|move: Endure', 'Dugtrio braced itself!'],
    ['p2a: Tyranitar|move: Focus Punch', 'The opposing Tyranitar is tightening its focus!'],
  ])('words %s', (rest, text) => {
    const { event, mon } = sceneOf('singleTurn', `|-singleturn|${rest}`)
    expect(singleTurn(mon(event.who), event.effect)).toEqual({ text })
  })

  it('gives a single-turn effect without a message our wording', () => {
    const { event, mon } = sceneOf('singleTurn', '|-singleturn|p1a: Dugtrio|move: Snatch')
    expect(singleTurn(mon(event.who), event.effect).fallback).toMatchObject({ kind: 'phrase' })
  })

  it('says Protect blocked a move, and gives other blocks our wording', () => {
    const { event, mon } = sceneOf('block', '|-block|p2a: Tyranitar|Protect')
    expect(blocked(mon(event.who), event.effect)).toEqual({
      text: 'The opposing Tyranitar protected itself!',
    })
    expect(blocked(mon(event.who), { name: 'Magic Coat', kind: 'move' })).toEqual({
      text: `The opposing Tyranitar was protected by Magic${NBSP}Coat!`,
      fallback: { kind: 'phrase', detail: 'no game message for a block by Magic Coat' },
    })
  })

  it("says Safeguard's block, which the parser reads from Gen 4's `-activate` line", () => {
    const { event, mon } = sceneOf(
      'block',
      '|move|p2a: Tyranitar|Thunder Wave|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Safeguard',
    )
    expect(blocked(mon(event.who), event.effect)).toEqual({
      text: 'Dugtrio is protected by Safeguard!',
    })
  })
})
