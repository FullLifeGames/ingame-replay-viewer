import { describe, expect, it } from 'vitest'

import { moveOf } from '../tables/lookup'
import { plain, sceneOf } from '../testing'

const stat = (side: 'near' | 'far', name: string, stages: number, arrows: string) => ({
  op: 'stat',
  side,
  stat: name,
  stages,
  arrows,
})

describe('stat changes', () => {
  it("plays Dragon Dance's two boosts as one arrow animation, then says each (X9)", () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Dragon Dance|p1a: Dugtrio',
      '|-boost|p1a: Dugtrio|atk|1',
      '|-boost|p1a: Dugtrio|spe|1',
    )
    expect(scene.slice(2).map(plain)).toEqual([
      stat('near', 'atk', 1, 'several'),
      "Dugtrio's Attack rose!",
      stat('near', 'spe', 1, 'none'),
      "Dugtrio's Speed rose!",
    ])
  })

  it('plays the arrows of one stat for a change alone, by its stages', () => {
    expect(sceneOf('|-unboost|p2a: Tyranitar|atk|2').map(plain)).toEqual([
      stat('far', 'atk', -2, 'one'),
      "The opposing Tyranitar's Attack harshly fell!",
    ])
  })

  it('starts a new animation where the direction or the Pokémon changes', () => {
    const scene = sceneOf(
      '|-boost|p1a: Dugtrio|spa|2',
      '|-unboost|p1a: Dugtrio|spe|1',
      '|-unboost|p2a: Tyranitar|spe|1',
    )
    expect(scene.flatMap((step) => (step.op === 'stat' ? [step.arrows] : []))).toEqual([
      'one',
      'one',
      'one',
    ])
  })

  // A stat at its limit, as the ladder replays gen3ou-2717395946 (Calm Mind at +6) and
  // gen3ou-2717081342 (Charm at -6) log it. The expansion says so and plays no arrows
  // (`IncreaseStat`, `battle_stat_change.c`): "{B_SCR_NAME_WITH_PREFIX}'s {B_BUFF1} won't go any
  // higher!" (`STRINGID_STATSWONTINCREASE`) and "… won't go any lower!" (`STRINGID_STATSWONTDECREASE`).
  it("says a stat at +6 won't go any higher, with no arrows", () => {
    expect(sceneOf('|-boost|p1a: Dugtrio|spa|0').map(plain)).toEqual([
      "Dugtrio's Sp. Atk won't go any higher!",
    ])
  })

  it("says a stat at -6 won't go any lower, with no arrows", () => {
    expect(sceneOf('|-unboost|p2a: Tyranitar|atk|0').map(plain)).toEqual([
      "The opposing Tyranitar's Attack won't go any lower!",
    ])
  })

  it('plays the arrows of the stat that still rises next to one at its limit', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Calm Mind|p1a: Dugtrio',
      '|-boost|p1a: Dugtrio|spa|0',
      '|-boost|p1a: Dugtrio|spd|1',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Calm Mind!',
      { op: 'move', user: 'near', target: 'near', move: moveOf('Calm Mind').number },
      "Dugtrio's Sp. Atk won't go any higher!",
      stat('near', 'spd', 1, 'one'),
      "Dugtrio's Sp. Def rose!",
    ])
  })
})
