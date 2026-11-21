import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { moveOf } from '../tables/lookup'
import { plain, sceneOf, streamOfLog } from '../testing'

const EARTHQUAKE = moveOf('Earthquake').number
const earthquake = '|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar'

describe('moves', () => {
  it('plays a critical super effective hit in the engine order (X5)', () => {
    const scene = sceneOf(
      earthquake,
      '|-crit|p2a: Tyranitar',
      '|-supereffective|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|10/100',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      { op: 'move', user: 'near', target: 'far', move: EARTHQUAKE },
      { op: 'hit', side: 'far', effectiveness: 'super' },
      { op: 'hp', side: 'far', hp: 10 },
      'A critical hit!',
      "It's super effective!",
    ])
  })

  it('plays no animation for a miss (X6)', () => {
    const scene = sceneOf(`${earthquake}|[miss]`, '|-miss|p1a: Dugtrio|p2a: Tyranitar')
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      'The opposing Tyranitar avoided the attack!',
    ])
  })

  it('says a miss without a target in our words, and lists it as a phrase fallback', () => {
    const result = streamOfLog('|-miss|p1a: Dugtrio')
    const prints = result.instructions.filter(({ line }) => line === NEXT)
    expect(prints.map(({ instruction }) => plain(instruction))).toEqual([
      "Dugtrio's attack missed!",
      { op: 'end', outcome: 'unknown' },
    ])
    expect(result.fallbacks).toEqual([
      { line: NEXT, kind: 'phrase', detail: 'no game message for a miss without a target' },
    ])
  })

  it('plays no animation for a still move or one without a target', () => {
    expect(sceneOf(`${earthquake}|[still]`).map(plain)).toEqual(['Dugtrio used Earthquake!'])
    const alone = '|move|p1a: Dugtrio|Earthquake||[notarget]'
    expect(sceneOf(alone).map(plain)).toEqual(['Dugtrio used Earthquake!'])
  })

  // The game plays no animation for a move that did nothing (#23): 994052 log lines 316 and 317.
  it('plays no animation for a move that fails at once', () => {
    const toxic = sceneOf('|move|p2a: Tyranitar|Toxic|p1a: Dugtrio', '|-fail|p1a: Dugtrio|tox')
    expect(toxic.map(plain)).toEqual([
      'The opposing Tyranitar used Toxic!',
      'Dugtrio is already poisoned!',
    ])
    const substitute = sceneOf(
      '|move|p1a: Dugtrio|Substitute|p1a: Dugtrio',
      '|-fail|p1a: Dugtrio|move: Substitute',
    )
    expect(substitute.map(plain)).not.toContainEqual(expect.objectContaining({ op: 'move' }))
  })

  it('plays no animation for a Substitute that the user has too little HP for', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Substitute|p1a: Dugtrio',
      '|-fail|p1a: Dugtrio|move: Substitute|[weak]',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Substitute!',
      'But it does not have enough HP left to make a substitute!',
    ])
  })

  it('plays no animation for a move the target is immune to', () => {
    const scene = sceneOf(earthquake, '|-immune|p2a: Tyranitar')
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      "It doesn't affect the opposing Tyranitar…",
    ])
  })

  it('plays no animation for a move that Protect stops', () => {
    const scene = sceneOf(earthquake, '|-activate|p2a: Tyranitar|Protect')
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Earthquake!',
      'The opposing Tyranitar protected itself!',
    ])
  })

  // gen3ou-2717395946: Jirachi's Calm Mind at +6/+6, copied onto Dugtrio.
  it('plays no animation for a stat move whose stats are all at their limit', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Calm Mind|p1a: Dugtrio',
      '|-boost|p1a: Dugtrio|spa|0',
      '|-boost|p1a: Dugtrio|spd|0',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Calm Mind!',
      "Dugtrio's Sp. Atk won't go any higher!",
      "Dugtrio's Sp. Def won't go any higher!",
    ])
  })

  // gen3ou-2717081342: Snorlax's Charm into Swampert at -6, then the end of the turn.
  it('plays no animation for a stat move at its limit, whatever the end of the turn shows', () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Charm|p1a: Dugtrio',
      '|-unboost|p1a: Dugtrio|atk|0',
      '|',
      '|-heal|p2a: Tyranitar|100/100|[from] item: Leftovers',
    )
    expect(scene).not.toContainEqual(expect.objectContaining({ op: 'move' }))
  })

  // Swagger and Flatter still confuse a target at the limit, and the game plays them.
  it('plays the animation of a Swagger or Flatter that confuses a target at the limit', () => {
    for (const [move, stat] of [
      ['Swagger', 'atk'],
      ['Flatter', 'spa'],
    ] as const) {
      const scene = sceneOf(
        `|move|p2a: Tyranitar|${move}|p1a: Dugtrio`,
        `|-boost|p1a: Dugtrio|${stat}|0`,
        '|-start|p1a: Dugtrio|confusion',
      )
      const number = moveOf(move).number
      expect(scene).toContainEqual({ op: 'move', user: 'far', target: 'near', move: number })
    }
  })

  // Speed Boost as Showdown logs it (`-ability` and `-boost`), here right after the limit.
  it("plays no animation for a stat move at its limit beside another Pokémon's raise", () => {
    const scene = sceneOf(
      '|move|p2a: Tyranitar|Charm|p1a: Dugtrio',
      '|-unboost|p1a: Dugtrio|atk|0',
      '|-ability|p2a: Tyranitar|Speed Boost|boost',
      '|-boost|p2a: Tyranitar|spe|1',
    )
    expect(scene).not.toContainEqual(expect.objectContaining({ op: 'move' }))
  })

  // Showdown logs Memento's drops of 0 and then the user's faint (`selfdestruct: 'ifHit'`); the
  // expansion plays it whatever the stats do (`EFFECT_MEMENTO` calls `BattleScript_Memento`,
  // `setatkhptozero`, `attackanimation`; src/battle_move_resolution.c, data/battle_scripts_1.s).
  it('plays the animation of a Memento into a target at -6/-6', () => {
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Memento|p2a: Tyranitar',
      '|-unboost|p2a: Tyranitar|atk|0',
      '|-unboost|p2a: Tyranitar|spa|0',
      '|faint|p1a: Dugtrio',
    )
    expect(scene.map(plain).slice(0, 2)).toEqual([
      'Dugtrio used Memento!',
      { op: 'move', user: 'near', target: 'far', move: moveOf('Memento').number },
    ])
  })

  it('aims a move on the user at its own side, and a far move at the near side', () => {
    const swordsDance = moveOf('Swords Dance').number
    const rockSlide = moveOf('Rock Slide').number
    const scene = sceneOf(
      '|move|p1a: Dugtrio|Swords Dance|p1a: Dugtrio',
      '|move|p2a: Tyranitar|Rock Slide|p1a: Dugtrio',
    )
    expect(scene.map(plain)).toEqual([
      'Dugtrio used Swords Dance!',
      { op: 'move', user: 'near', target: 'near', move: swordsDance },
      'The opposing Tyranitar used Rock Slide!',
      { op: 'move', user: 'far', target: 'near', move: rockSlide },
    ])
  })

  it("aims a move the log gives no target at its user's side", () => {
    const scene = sceneOf('|move|p1a: Dugtrio|Haze|')
    expect(scene[1]).toEqual({
      op: 'move',
      user: 'near',
      target: 'near',
      move: moveOf('Haze').number,
    })
  })

  it('lists a move the expansion lacks with the move it plays', () => {
    const result = streamOfLog('|move|p2a: Tyranitar|Paleo Wave|p1a: Dugtrio')
    expect(result.fallbacks).toEqual([{ line: NEXT, ...moveOf('Paleo Wave').fallback }])
    expect(result.instructions[7]?.instruction).toEqual({
      op: 'move',
      user: 'far',
      target: 'near',
      move: moveOf('Paleo Wave').number,
    })
  })
})

describe('move results', () => {
  it('words an immunity, a failure, and a crit or resistance no hit took', () => {
    const scene = sceneOf(
      '|-immune|p1a: Dugtrio',
      '|-fail|p2a: Tyranitar',
      '|-crit|p2a: Tyranitar',
      '|-resisted|p2a: Tyranitar',
    )
    expect(scene.map(plain)).toEqual([
      "It doesn't affect Dugtrio…",
      'But it failed!',
      'A critical hit!',
      "It's not very effective…",
    ])
  })
})
