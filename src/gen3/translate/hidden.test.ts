// A Pokémon that Fly, Dig, Dive or Bounce hid (#65): the game shows it again in move end when its
// hit turn hits nothing (`MoveEndAttackerVisible`), and the hit's own animation shows it when the
// hit lands. The engine tests of rom/gen3/test/replay_hidden.c pin what the game does.
import { describe, expect, it } from 'vitest'

import { NEXT, scriptOf } from '../../script/testing'
import { buildGen3Stream } from '../backend'
import type { Instruction } from '../stream/instructions'
import { moveOf } from '../tables/lookup'
import { plain, popUp, sceneOf } from '../testing'

const FLY = ['|move|p2a: Tyranitar|Fly||[still]', '|-prepare|p2a: Tyranitar|Fly']
const DIG = ['|move|p1a: Dugtrio|Dig||[still]', '|-prepare|p1a: Dugtrio|Dig']

/** The scene after a charge turn's three instructions: its "used" line, its line and its MOVE. */
const afterCharge = (...lines: string[]) =>
  sceneOf(...lines)
    .slice(3)
    .map(plain)

const shows = (scene: readonly unknown[]) =>
  scene.filter((step) => typeof step === 'object' && (step as Instruction).op === 'showMon')

const SHOW_FAR = { op: 'showMon', side: 'far' }
const SHOW_NEAR = { op: 'showMon', side: 'near' }

const moveOn = (user: 'near' | 'far', name: string, animTurn: number) => ({
  op: 'move',
  user,
  target: user === 'near' ? 'far' : 'near',
  move: moveOf(name).number,
  animTurn,
})

describe('a hit turn that hits nothing shows the hidden user after its result line', () => {
  it('after a miss', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p2a: Tyranitar|Fly|p1a: Dugtrio|[miss]',
      '|-miss|p2a: Tyranitar|p1a: Dugtrio',
    )
    expect(scene).toEqual([
      'The opposing Tyranitar used Fly!',
      'Dugtrio avoided the attack!',
      SHOW_FAR,
    ])
  })

  it('after Protect', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p2a: Tyranitar|Fly|p1a: Dugtrio',
      '|-activate|p1a: Dugtrio|move: Protect',
    )
    expect(scene).toEqual([
      'The opposing Tyranitar used Fly!',
      'Dugtrio protected itself!',
      SHOW_FAR,
    ])
  })

  it("after a type's immunity", () => {
    const scene = afterCharge(
      ...DIG,
      '|move|p1a: Dugtrio|Dig|p2a: Tyranitar',
      '|-immune|p2a: Tyranitar',
    )
    expect(scene).toEqual([
      'Dugtrio used Dig!',
      "It doesn't affect the opposing Tyranitar…",
      SHOW_NEAR,
    ])
  })

  it("after an ability's immunity, once its pop-up is down", () => {
    const scene = afterCharge(
      ...DIG,
      '|move|p1a: Dugtrio|Dig|p2a: Tyranitar',
      '|-immune|p2a: Tyranitar|[from] ability: Levitate',
    )
    expect(scene).toEqual([
      'Dugtrio used Dig!',
      popUp('far', 'Levitate', true),
      expect.any(String),
      popUp('far', 'Levitate', false),
      SHOW_NEAR,
    ])
  })

  it('after an ability takes the move in', () => {
    const scene = afterCharge(
      '|move|p1a: Dugtrio|Dive||[still]',
      '|-prepare|p1a: Dugtrio|Dive',
      '|move|p1a: Dugtrio|Dive|p2a: Tyranitar',
      '|-heal|p2a: Tyranitar|100/100|[from] ability: Water Absorb|[of] p1a: Dugtrio',
    )
    expect(scene.at(-2)).toEqual(popUp('far', 'Water Absorb', false))
    expect(scene.at(-1)).toEqual(SHOW_NEAR)
    expect(shows(scene)).toHaveLength(1)
  })

  it('after a move with no target left', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p2a: Tyranitar|Fly||[notarget]',
      '|-notarget|p2a: Tyranitar',
    )
    expect(scene).toEqual(['The opposing Tyranitar used Fly!', expect.any(String), SHOW_FAR])
  })

  it('after the move line, when the move logs no result', () => {
    const scene = afterCharge(...FLY, '|move|p2a: Tyranitar|Fly||[notarget]', '|turn|2')
    expect(scene.slice(0, 2)).toEqual(['The opposing Tyranitar used Fly!', SHOW_FAR])
  })
})

describe('a hit turn that the user cannot take shows it after the line', () => {
  it('after a full paralysis and its animation', () => {
    expect(afterCharge(...FLY, '|cant|p2a: Tyranitar|par')).toEqual([
      "The opposing Tyranitar couldn't move because it's paralyzed!",
      { op: 'anim', side: 'far', anim: 'statusPrz' },
      SHOW_FAR,
    ])
  })

  it('after a flinch, sleep or love', () => {
    expect(afterCharge(...FLY, '|cant|p2a: Tyranitar|flinch')).toEqual([
      "The opposing Tyranitar flinched and couldn't move!",
      SHOW_FAR,
    ])
    expect(afterCharge(...FLY, '|cant|p2a: Tyranitar|slp').slice(1)).toEqual([
      { op: 'anim', side: 'far', anim: 'statusSlp' },
      SHOW_FAR,
    ])
    const love = afterCharge(
      ...FLY,
      '|-activate|p2a: Tyranitar|move: Attract|[of] p1a: Dugtrio',
      '|cant|p2a: Tyranitar|Attract',
    )
    expect(love.at(-1)).toEqual(SHOW_FAR)
    expect(shows(love)).toHaveLength(1)
  })

  it('after the HP of a confusion self-hit', () => {
    const scene = afterCharge(
      ...FLY,
      '|-activate|p2a: Tyranitar|confusion',
      '|-damage|p2a: Tyranitar|80/100|[from] confusion',
    )
    expect(scene.slice(-2)).toEqual([{ op: 'hp', side: 'far', hp: 80 }, SHOW_FAR])
    expect(shows(scene)).toHaveLength(1)
  })
})

describe('a hidden user stays hidden without a show', () => {
  it('when its hit lands: the hit shows it', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p2a: Tyranitar|Fly|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|50/100',
    )
    expect(scene.slice(0, 2)).toEqual(['The opposing Tyranitar used Fly!', moveOn('far', 'Fly', 1)])
    expect(shows(scene)).toEqual([])
  })

  it('when a move hits it, then its own hit lands', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p1a: Dugtrio|Thunder|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|60/100',
      '|move|p2a: Tyranitar|Fly|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|50/100',
    )
    expect(scene).toContainEqual({ op: 'hit', side: 'far', effectiveness: 'normal' })
    expect(shows(scene)).toEqual([])
  })

  it('when a confusion self-hit knocks it out: the faint slides the hidden sprite down', () => {
    const scene = afterCharge(
      ...FLY,
      '|-activate|p2a: Tyranitar|confusion',
      '|-damage|p2a: Tyranitar|0 fnt|[from] confusion',
      '|faint|p2a: Tyranitar',
    )
    expect(scene).toContainEqual({ op: 'hp', side: 'far', hp: 0 })
    expect(shows(scene)).toEqual([])
  })

  it('when it faints, and its replacement is no hidden Pokémon', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p1a: Dugtrio|Thunder|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|0 fnt',
      '|faint|p2a: Tyranitar',
      '|switch|p2a: Skarmory|Skarmory, M|100/100',
      '|cant|p2a: Skarmory|par',
    )
    expect(shows(scene)).toEqual([])
  })

  it('when the log ends', () => {
    expect(shows(afterCharge(...FLY, '|win|Alice'))).toEqual([])
    expect(shows(afterCharge(...FLY))).toEqual([])
  })

  it('never, after a charge that does not hide', () => {
    const scene = afterCharge(
      '|move|p1a: Dugtrio|Solar Beam||[still]',
      '|-prepare|p1a: Dugtrio|Solar Beam',
      '|move|p1a: Dugtrio|Solar Beam|p2a: Tyranitar|[miss]',
      '|-miss|p1a: Dugtrio|p2a: Tyranitar',
    )
    expect(shows(scene)).toEqual([])
  })
})

// The game cannot reach this: a hidden user's next move is its hit. A missing show would leave it
// hidden for the rest of the battle, so any other MOVE shows it first.
describe('a hidden user that plays another move', () => {
  it('shows before that MOVE, once', () => {
    const scene = afterCharge(
      ...FLY,
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|50/100',
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|10/100',
    )
    expect(scene.slice(0, 3)).toEqual([
      'The opposing Tyranitar used Crunch!',
      SHOW_FAR,
      moveOn('far', 'Crunch', 0),
    ])
    expect(shows(scene)).toHaveLength(1)
  })
})

/** The stream of `lines` as a replay of generation `gen` would give it. */
const streamOfGen = (gen: number, ...lines: string[]) =>
  buildGen3Stream({ ...scriptOf(...lines), gen })

describe('a hit turn that a full paralysis or Disable stops in Gen 1 and 2', () => {
  // Gen 1 keeps a fully paralysed Fly or Dig user out of reach; the Gen 3 game shows it.
  it('shows the user, and Gen 1 notes the invulnerability it keeps', () => {
    const lines = [...DIG, '|cant|p1a: Dugtrio|par']
    for (const gen of [1, 2]) {
      const { instructions } = streamOfGen(gen, ...lines)
      expect(instructions.at(-2)?.instruction).toEqual(SHOW_NEAR)
    }
    const at = NEXT + lines.length - 1
    expect(streamOfGen(1, ...lines).fallbacks.filter(({ line }) => line === at)).toEqual([
      { line: at, kind: 'mechanic', detail: expect.stringContaining('Dig') as string },
    ])
    expect(streamOfGen(2, ...lines).fallbacks.filter(({ line }) => line === at)).toEqual([])
  })

  it('notes the same gap for Disable in Gen 1, and none for a flinch', () => {
    const mechanics = (...lines: string[]) =>
      streamOfGen(1, ...DIG, ...lines).fallbacks.filter(({ kind }) => kind === 'mechanic')
    expect(mechanics('|cant|p1a: Dugtrio|Disable|Dig')).toHaveLength(1)
    expect(mechanics('|cant|p1a: Dugtrio|flinch')).toEqual([])
  })
})
