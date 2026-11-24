// The animation turn of each MOVE (#65), scene by scene, as the engine tests of
// rom/gen3/test/replay_anim_turns.c pin it ("Replay: engine: …").
import { describe, expect, it } from 'vitest'

import type { Instruction } from '../stream/instructions'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf } from '../testing'

const number = (name: string) => moveOf(name).number

const movesOf = (scene: readonly Instruction[]) => scene.filter(({ op }) => op === 'move')

const turnsOf = (scene: readonly Instruction[]) =>
  movesOf(scene).map((instruction) => (instruction.op === 'move' ? instruction.animTurn : -1))

const SOLAR_BEAM = number('Solar Beam')
const charge = ['|move|p1a: Dugtrio|Solar Beam||[still]', '|-prepare|p1a: Dugtrio|Solar Beam']
const beam = { op: 'move', user: 'near', target: 'far', move: SOLAR_BEAM, animTurn: 1 }

describe('a two-turn move', () => {
  it('says its charge line, then plays the charge on turn 0 and its hit on turn 1', () => {
    const scene = sceneOf(
      ...charge,
      '|move|p1a: Dugtrio|Solar Beam|p2a: Tyranitar|[from]lockedmove',
      '|-damage|p2a: Tyranitar|50/100',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Solar Beam!',
      'Dugtrio absorbed light!',
      { op: 'move', user: 'near', target: 'near', move: SOLAR_BEAM, animTurn: 0 },
      'Dugtrio used Solar Beam!',
      beam,
      { op: 'hit', side: 'far', effectiveness: 'normal' },
      { op: 'hp', side: 'far', hp: 50 },
    ])
  })

  // Engine test "Solar Beam in sun says its line, charges, then fires on turn 1".
  it('in sun says its line, charges and fires in one turn', () => {
    const scene = sceneOf(
      ...charge,
      '|-anim|p1a: Dugtrio|Solar Beam|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|50/100',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Solar Beam!',
      'Dugtrio absorbed light!',
      { op: 'move', user: 'near', target: 'near', move: SOLAR_BEAM, animTurn: 0 },
      beam,
      { op: 'hit', side: 'far', effectiveness: 'normal' },
      { op: 'hp', side: 'far', hp: 50 },
    ])
  })

  it('in sun plays no beam that misses', () => {
    const scene = sceneOf(
      ...charge,
      '|-anim|p1a: Dugtrio|Solar Beam|p2a: Tyranitar|[miss]',
      '|-miss|p1a: Dugtrio|p2a: Tyranitar',
    )
    expect(turnsOf(scene)).toEqual([0])
    expect(scene.map(plain).at(-1)).toBe('The opposing Tyranitar avoided the attack!')
  })

  // `Cmd_twoturnmoveschargestringandanimation`: a move with an effect on its charge turn
  // (`onChargeTurnOnly`) plays the animation before the line.
  it('plays the charge of a move with a charge-turn effect before its line', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Skull Bash||[still]',
      '|-prepare|p1a: Dugtrio|Skull Bash',
      '|-boost|p1a: Dugtrio|def|1',
    )
    expect(scene.map(plain).slice(0, 3)).toEqual([
      'Dugtrio used Skull Bash!',
      { op: 'move', user: 'near', target: 'near', move: number('Skull Bash'), animTurn: 0 },
      'Dugtrio tucked in its head!',
    ])
  })

  it('aims its charge at the target the charge line names', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Fly||[still]',
      '|-prepare|p2a: Tyranitar|Fly|p1a: Dugtrio',
    )
    expect(scene.map(plain)).toEqual([
      'The opposing Tyranitar used Fly!',
      'The opposing Tyranitar flew up high!',
      { op: 'move', user: 'far', target: 'near', move: number('Fly'), animTurn: 0 },
    ])
  })

  // Risk R3 of the lane plan: a user that faints in the air gets no hit turn, as in the game.
  it('plays no hit turn for a user that faints after its charge', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Fly||[still]',
      '|-prepare|p1a: Dugtrio|Fly',
      '|move|p2a: Tyranitar|Thunder|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|0 fnt',
      '|faint|p1a: Dugtrio',
    )
    expect(movesOf(scene).map((move) => move.op === 'move' && [move.move, move.animTurn])).toEqual([
      [number('Fly'), 0],
      [number('Thunder'), 0],
    ])
  })
})

describe('Curse', () => {
  it('by a Pokémon that starts no curse plays the stat raise, turn 1', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Curse|p2a: Tyranitar',
      '|-unboost|p2a: Tyranitar|spe|1',
      '|-boost|p2a: Tyranitar|atk|1',
      '|-boost|p2a: Tyranitar|def|1',
    )
    expect(movesOf(scene)).toEqual([
      { op: 'move', user: 'far', target: 'far', move: number('Curse'), animTurn: 1 },
    ])
  })

  it('that lays a curse plays the Ghost one, turn 0', () => {
    const scene = sceneOf(
      '|switch|p1a: Gengar|Gengar, M|100/100',
      '|move|p1a: Gengar|Curse|p2a: Tyranitar',
      '|-start|p2a: Tyranitar|Curse|[of] p1a: Gengar',
      '|-damage|p1a: Gengar|50/100',
    )
    expect(turnsOf(scene)).toEqual([0])
  })
})

describe('Brick Break', () => {
  it('through a screen on its target side plays turn 1, and with none turn 0', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Reflect|p2a: Tyranitar',
      '|-sidestart|p2: Bob|Reflect',
      '|move|p1a: Dugtrio|Brick Break|p2a: Tyranitar',
      '|-sideend|p2: Bob|Reflect',
      '|-damage|p2a: Tyranitar|60/100',
      '|move|p1a: Dugtrio|Brick Break|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|20/100',
    )
    expect(turnsOf(scene)).toEqual([0, 1, 0])
  })
})

describe('a future attack', () => {
  const lastMover = ['|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio', '|-damage|p1a: Dugtrio|80/100']

  it.each(['Future Sight', 'Doom Desire'])(
    '%s says its line, then its user plays the hit on turn 1',
    (move) => {
      const scene = sceneOf(
        `|move|p1a: Dugtrio|${move}|p2a: Tyranitar`,
        `|-start|p1a: Dugtrio|${move}`,
        ...lastMover,
        `|-end|p2a: Tyranitar|move: ${move}`,
        '|-damage|p2a: Tyranitar|50/100',
      )
      const end = scene.map(plain).slice(-4)
      expect(end.slice(1)).toEqual([
        { op: 'move', user: 'near', target: 'far', move: number(move), animTurn: 1 },
        { op: 'hit', side: 'far', effectiveness: 'normal' },
        { op: 'hp', side: 'far', hp: 50 },
      ])
      expect(typeof end[0]).toBe('string')
    },
  )

  it('plays no hit animation while its side has no Pokémon out', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Future Sight|p2a: Tyranitar',
      '|-start|p1a: Dugtrio|Future Sight',
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|0 fnt',
      '|faint|p1a: Dugtrio',
      '|-end|p2a: Tyranitar|move: Future Sight',
      '|-damage|p2a: Tyranitar|50/100',
    )
    expect(turnsOf(scene)).toEqual([0, 0])
    expect(scene.map(plain)).toContain('The opposing Tyranitar took the Future Sight attack!')
  })
})

describe('Swallow', () => {
  it.each([1, 2, 3])('after %i Stockpiles plays that count as its turn', (count) => {
    const stockpiles = Array.from({ length: count }, (_, index) => [
      '|move|p1a: Dugtrio|Stockpile|p1a: Dugtrio',
      `|-start|p1a: Dugtrio|stockpile${String(index + 1)}`,
    ]).flat()
    const scene = sceneOf(
      ...stockpiles,
      '|move|p1a: Dugtrio|Swallow|p1a: Dugtrio',
      '|-heal|p1a: Dugtrio|100/100',
      '|-end|p1a: Dugtrio|Stockpile',
    )
    expect(turnsOf(scene).at(-1)).toBe(count)
  })
})
