// Multi-hit moves (#15), as the pinned expansion plays them: every hit plays the move's animation,
// the hit and the bar, and says its critical hit; the effectiveness waits for the last hit, then
// the count line follows. A target that the last hit knocks out faints before both lines.
import { describe, expect, it } from 'vitest'

import type { Side } from '../../script/types'
import type { Instruction } from '../stream/instructions'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf } from '../testing'

type Effectiveness = 'normal' | 'super' | 'resisted'

const move = (name: string, user: Side = 'near', target: Side = 'far') => ({
  op: 'move',
  user,
  target,
  move: moveOf(name).number,
})
const hit = (side: Side, effectiveness: Effectiveness = 'normal') => ({
  op: 'hit',
  side,
  effectiveness,
})
const hp = (side: Side, value: number) => ({ op: 'hp', side, hp: value })
const ROCK_BLAST = move('Rock Blast')
const DOUBLE_KICK = move('Double Kick')
const FAINTED = 'The opposing Tyranitar fainted!'
const SUPER = "It's super effective!"

const shown = (...lines: string[]) => sceneOf(...lines).map(plain)

describe('a multi-hit move', () => {
  it('plays the move before every hit and says the effectiveness once, then the count', () => {
    expect(
      shown(
        '|move|p1a: Dugtrio|Rock Blast|p2a: Tyranitar',
        '|-supereffective|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|80/100',
        '|-supereffective|p2a: Tyranitar',
        '|-crit|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|55/100',
        '|-supereffective|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|35/100',
        '|-hitcount|p2a: Tyranitar|3',
      ),
    ).toEqual([
      'Dugtrio used Rock Blast!',
      ROCK_BLAST,
      hit('far', 'super'),
      hp('far', 80),
      ROCK_BLAST,
      hit('far', 'super'),
      hp('far', 55),
      'A critical hit!',
      ROCK_BLAST,
      hit('far', 'super'),
      hp('far', 35),
      SUPER,
      'The Pokémon was hit 3 times!',
    ])
  })

  it('faints a target that the last hit knocks out before the count line', () => {
    expect(
      shown(
        '|move|p1a: Dugtrio|Double Kick|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|20/100',
        '|-damage|p2a: Tyranitar|0 fnt',
        '|-hitcount|p2a: Tyranitar|2',
        '|faint|p2a: Tyranitar',
      ),
    ).toEqual([
      'Dugtrio used Double Kick!',
      DOUBLE_KICK,
      hit('far'),
      hp('far', 20),
      DOUBLE_KICK,
      hit('far'),
      hp('far', 0),
      { op: 'faint', side: 'far' },
      FAINTED,
      'The Pokémon was hit 2 times!',
    ])
  })

  it('says the effectiveness after the faint of a knocked out target', () => {
    expect(
      shown(
        '|move|p1a: Dugtrio|Double Kick|p2a: Tyranitar',
        '|-supereffective|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|20/100',
        '|-supereffective|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|0 fnt',
        '|-hitcount|p2a: Tyranitar|2',
        '|faint|p2a: Tyranitar',
      ).slice(-4),
    ).toEqual([{ op: 'faint', side: 'far' }, FAINTED, SUPER, 'The Pokémon was hit 2 times!'])
  })

  it('counts a single hit in the singular', () => {
    expect(
      shown(
        '|move|p1a: Dugtrio|Double Kick|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|0 fnt',
        '|-hitcount|p2a: Tyranitar|1',
        '|faint|p2a: Tyranitar',
      ),
    ).toEqual([
      'Dugtrio used Double Kick!',
      DOUBLE_KICK,
      hit('far'),
      hp('far', 0),
      { op: 'faint', side: 'far' },
      FAINTED,
      'The Pokémon was hit 1 time!',
    ])
  })

  it('plays the move before a hit that breaks a Substitute', () => {
    const scene = shown(
      '|move|p1a: Dugtrio|Double Kick|p2a: Tyranitar',
      '|-activate|p2a: Tyranitar|Substitute|[damage]',
      '|-end|p2a: Tyranitar|Substitute',
      '|-hitcount|p2a: Tyranitar|2',
    )

    const isOp = (op: string) => (step: string | Instruction) =>
      typeof step !== 'string' && step.op === op
    expect(scene.filter((step) => isOp('move')(step) || isOp('hit')(step))).toEqual([
      DOUBLE_KICK,
      hit('far'),
      DOUBLE_KICK,
      hit('far'),
    ])
    expect(scene.at(-1)).toBe('The Pokémon was hit 2 times!')
  })
})

describe('a move with one hit', () => {
  it('keeps the effectiveness right after the bar', () => {
    expect(
      shown(
        '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
        '|-supereffective|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|50/100',
      ),
    ).toEqual([
      'Dugtrio used Earthquake!',
      move('Earthquake'),
      hit('far', 'super'),
      hp('far', 50),
      SUPER,
    ])
  })

  it('plays once after a multi-hit move', () => {
    expect(
      shown(
        '|move|p1a: Dugtrio|Double Kick|p2a: Tyranitar',
        '|-damage|p2a: Tyranitar|80/100',
        '|-damage|p2a: Tyranitar|60/100',
        '|-hitcount|p2a: Tyranitar|2',
        '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
        '|-supereffective|p1a: Dugtrio',
        '|-damage|p1a: Dugtrio|40/100',
      ).slice(-6),
    ).toEqual([
      'The Pokémon was hit 2 times!',
      'The opposing Tyranitar used Crunch!',
      move('Crunch', 'far', 'near'),
      hit('near', 'super'),
      hp('near', 40),
      SUPER,
    ])
  })
})
