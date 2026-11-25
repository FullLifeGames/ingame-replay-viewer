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
  // (`battle_stat_change.c`): `IncreaseStat` "{B_SCR_NAME_WITH_PREFIX}'s {B_BUFF1} won't go any
  // higher!" (`STRINGID_STATSWONTINCREASE`), `DecreaseStat` "… won't go any lower!"
  // (`STRINGID_STATSWONTDECREASE`).
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
      { op: 'move', user: 'near', target: 'near', move: moveOf('Calm Mind').number, animTurn: 0 },
      "Dugtrio's Sp. Atk won't go any higher!",
      stat('near', 'spd', 1, 'one'),
      "Dugtrio's Sp. Def rose!",
    ])
  })
})

// Rage (`MoveEndRage`, `BattleScript_RageIsBuilding`): a hit on a Pokémon in a rage raises its
// Attack with the arrows and "rose!" line, then says "{B_DEF_NAME_WITH_PREFIX}'s rage is
// building!". Gen 2 and 3 log the start as `-singlemove` and the raise with no cause
// (`data/moves.ts` `rage`); Gen 1 logs no start and the raise `[from] Rage` (`mods/gen1`).
describe('Rage', () => {
  const rage = [
    '|move|p2a: Tyranitar|Rage|p1a: Dugtrio',
    '|-damage|p1a: Dugtrio|90/100',
    '|-singlemove|p2a: Tyranitar|Rage',
  ]
  const textAfter = (...lines: string[]) =>
    sceneOf(...lines)
      .slice(-3)
      .map(plain)
  const building = [
    stat('far', 'atk', 1, 'one'),
    "The opposing Tyranitar's Attack rose!",
    "The opposing Tyranitar's rage is building!",
  ]

  it('says the rage builds as a hit raises Attack (Gen 2 and 3)', () => {
    const hit = ['|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar', '|-damage|p2a: Tyranitar|70/100']

    expect(textAfter(...rage, ...hit, '|-boost|p2a: Tyranitar|atk|1')).toEqual(building)
  })

  it('says the rage builds as the log names Rage the cause (Gen 1)', () => {
    const lines = [
      '|move|p2a: Tyranitar|Rage|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|90/100',
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|70/100',
      '|-boost|p2a: Tyranitar|atk|1|[from] Rage',
    ]

    expect(textAfter(...lines)).toEqual(building)
  })

  it('says no rage for a raise with no hit, or after the Pokémon moved or switched again', () => {
    const swagger = ['|move|p1a: Dugtrio|Swagger|p2a: Tyranitar', '|-boost|p2a: Tyranitar|atk|1']
    const movedAgain = [
      '|move|p2a: Tyranitar|Crunch|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|80/100',
      '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|70/100',
      '|-boost|p2a: Tyranitar|atk|1',
    ]

    const switchedBack = [
      '|switch|p2a: Skarmory|Skarmory, F|100/100',
      '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
      ...movedAgain.slice(2),
    ]
    const rose = "The opposing Tyranitar's Attack rose!"
    expect(textAfter(...rage, ...swagger)[2]).toBe(rose)
    expect(textAfter(...rage, ...movedAgain)[2]).toBe(rose)
    expect(textAfter(...rage, ...switchedBack)[2]).toBe(rose)
  })
})
