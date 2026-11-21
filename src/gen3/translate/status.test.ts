import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, sceneOf, streamOfLog } from '../testing'

const anyMove = { op: 'move', user: 'far', target: 'near', move: expect.any(Number) as number }
const status = (side: 'near' | 'far', value: string, slot = 0) => ({
  op: 'status',
  side,
  slot,
  status: value,
})

describe('a status given', () => {
  it('plays the status animation, says it and sets the status, as for Toxic (X7)', () => {
    const scene = sceneOf('|move|p2a: Tyranitar|Toxic|p1a: Dugtrio', '|-status|p1a: Dugtrio|tox')
    expect(scene.map(plain)).toEqual([
      'The opposing Tyranitar used Toxic!',
      anyMove,
      { op: 'anim', side: 'near', anim: 'statusPsn' },
      'Dugtrio was badly poisoned!',
      status('near', 'tox'),
    ])
  })

  it('gives each status its own animation', () => {
    const anims = sceneOf(
      '|-status|p2a: Tyranitar|brn',
      '|-status|p2a: Tyranitar|par',
      '|-status|p2a: Tyranitar|slp',
      '|-status|p2a: Tyranitar|frz',
      '|-status|p2a: Tyranitar|psn',
    ).flatMap((instruction) => (instruction.op === 'anim' ? [instruction.anim] : []))
    expect(anims).toEqual(['statusBrn', 'statusPrz', 'statusSlp', 'statusFrz', 'statusPsn'])
  })

  it('lets Rest say it slept and restored its HP, with no animation, as the pinned script does', () => {
    const scene = sceneOf(
      '|-status|p1a: Dugtrio|slp|[from] move: Rest',
      '|-heal|p1a: Dugtrio|100/100 slp|[silent]',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio slept and restored its HP!',
      status('near', 'slp'),
      { op: 'hp', side: 'near', hp: 100 },
    ])
  })
})

describe('a status cured', () => {
  it('says the cure, then clears the status', () => {
    expect(sceneOf('|-curestatus|p2a: Tyranitar|slp|[msg]').map(plain)).toEqual([
      'The opposing Tyranitar woke up!',
      status('far', 'none'),
    ])
  })

  it('clears a silent cure such as Natural Cure on the way out without a word', () => {
    const scene = sceneOf('|-curestatus|p1a: Dugtrio|par|[from] ability: Natural Cure|[silent]')
    expect(scene).toEqual([status('near', 'none')])
  })

  it('cures each team member that has a status after the team line', () => {
    const scene = sceneOf(
      '|-status|p1a: Dugtrio|par',
      '|switch|p1a: Zapdos|Zapdos|100/100',
      '|-status|p2a: Tyranitar|brn',
      '|-cureteam|p1a: Zapdos|[from] move: Heal Bell',
    )
    expect(scene.slice(-2).map(plain)).toEqual(['A bell chimed!', status('near', 'none', 0)])
  })

  it('leaves a status cured before the team line alone', () => {
    const scene = sceneOf(
      '|-status|p1a: Dugtrio|par',
      '|-curestatus|p1a: Dugtrio|par|[msg]',
      '|-cureteam|p1a: Dugtrio|[from] move: Heal Bell',
    )
    expect(scene.slice(-1).map(plain)).toEqual(['A bell chimed!'])
  })

  it('remembers a status a switch or an HP line shows', () => {
    const scene = sceneOf(
      '|switch|p1a: Zapdos|Zapdos|100/100 brn',
      '|-damage|p2a: Tyranitar|50/100 psn|[from] psn',
      '|-cureteam|p1a: Zapdos|[from] move: Aromatherapy',
      '|-cureteam|p2a: Tyranitar|[from] move: Aromatherapy',
    )
    expect(scene.filter(({ op }) => op === 'status')).toEqual([
      status('near', 'none', 1),
      status('far', 'none', 0),
    ])
  })
})

describe('a Pokémon that cannot move', () => {
  it('says paralysis stopped it, then plays the paralysis animation (X8)', () => {
    expect(sceneOf('|cant|p2a: Tyranitar|par').map(plain)).toEqual([
      "The opposing Tyranitar couldn't move because it's paralyzed!",
      { op: 'anim', side: 'far', anim: 'statusPrz' },
    ])
  })

  it('plays the sleep and freeze animations after their lines, and none after a flinch', () => {
    const scene = sceneOf(
      '|cant|p1a: Dugtrio|slp',
      '|cant|p1a: Dugtrio|frz',
      '|cant|p1a: Dugtrio|flinch',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio is fast asleep.',
      { op: 'anim', side: 'near', anim: 'statusSlp' },
      'Dugtrio is frozen solid!',
      { op: 'anim', side: 'near', anim: 'statusFrz' },
      "Dugtrio flinched and couldn't move!",
    ])
  })

  it('lists a reason the game has no line for as a fallback', () => {
    const result = streamOfLog('|cant|p1a: Dugtrio|Mystery')
    expect(result.fallbacks).toEqual([
      { line: NEXT, kind: 'phrase', detail: 'no game message for a Pokémon held back by Mystery' },
    ])
  })
})
