import { describe, expect, it } from 'vitest'

import { battleState } from './battle-state.ts'
import { actionsOf } from './blocks.ts'
import { battleConstant, type EffectScene, effectNumber, simpleHp } from './effect-scene.ts'
import { constant, effectScript, effectWrites, NEAR, writtenAt } from './effect-testing.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

const SCRIPT = effectScript()
const [ACTION = []] = actionsOf(SCRIPT)

/** A scene of the leads' script on numbers whose constants and effects lack every name. */
const sceneOn = (numbers: EffectScene['numbers']): EffectScene => ({
  state: battleState(SCRIPT, NUMBERS.battle),
  numbers,
  action: ACTION,
  index: 0,
  events: SCRIPT.events,
  at: 0,
})
const BARE = sceneOn({
  ...NUMBERS,
  battle: { ...NUMBERS.battle, constants: {} },
  effects: { ...NUMBERS.effects, addEffects: {} },
})

// Scene: a pin that drops a constant or an effect must fail by its name, never send a wrong
// number.
describe('the numbers of a scene', () => {
  it('names a battle constant that bw2.json lacks', () => {
    expect(() => battleConstant(BARE, 'CONDITION_BURN')).toThrow('bw2.json has no CONDITION_BURN')
  })

  it('names an effect that bw2.json lacks', () => {
    expect(() => effectNumber(BARE, 'addEffects', 'CONDITION_BURN')).toThrow(
      'bw2.json has no effects.addEffects.CONDITION_BURN',
    )
  })
})

// Scene: ServerDisplay_SimpleHP puts the gauge even when the game's HP already equals the log's.
describe('the HP of a sequence', () => {
  it('moves the gauge alone when the HP stays', () => {
    const scene = sceneOn(NUMBERS)
    const dugtrio = { side: 'near', index: 0 } as const
    expect(simpleHp(scene, dugtrio, { hp: 100, max: 100 }, NEAR.firstMonId)).toEqual([
      { command: 'SC_UPDATE_HP_GAUGE', args: [NEAR.firstMonId] },
    ])
  })
})

describe('the specs’ helpers', () => {
  it('name a line after the turn that holds no event', () => {
    expect(() => writtenAt(effectWrites({}), 3)).toThrow('no event at line 3 after the turn')
  })

  it('name a constant that REPLAY_NUMBERS lacks', () => {
    expect(() => constant('CONDITION_TAUNT')).toThrow('REPLAY_NUMBERS has no CONDITION_TAUNT')
  })
})
