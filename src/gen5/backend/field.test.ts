import { describe, expect, it } from 'vitest'

import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import { cmd, constant, effectWrites, FAR, NEAR, writtenAt } from './effect-testing.ts'
import { FIELD_SEQUENCES } from './field.ts'
import { lineId } from './lines.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'

// The invented battle of REPLAY_NUMBERS: Alice's client 3 holds Dugtrio, mon ID 40, at position
// 0, and Politoed next, mon ID 41; Bob's client 2 holds Tyranitar, mon ID 10, at position 1, and
// Blissey next, mon ID 11. Line 0 is the first line after `|turn|1`.
const POLITOED = NEAR.firstMonId + 1
const BLISSEY = FAR.firstMonId + 1
const { weatherTurns, sandEffects, sideMask } = NUMBERS.effects
/** GetClientSide: the side argument of a side's lines. */
const NEAR_SIDE = NEAR.client & sideMask
const FAR_SIDE = FAR.client & sideMask

const line = (name: keyof typeof GEN5_EFFECT_LINES, ...args: number[]): ServerCommand => {
  const effect = GEN5_EFFECT_LINES[name]
  const command = effect.bank === 'set' ? 'SC_MSG_SET' : 'SC_MSG_STD'
  return { command, message: lineId(NUMBERS.text, effect), args }
}
const writes = (...lines: string[]) => effectWrites(FIELD_SEQUENCES, ...lines)

// Scene: Politoed comes in and its Drizzle makes it rain. BattleHandler_ChangeWeather wraps the
// weather's start in Politoed's ability pop-up; the client says it started to rain.
describe("a weather's start", () => {
  it("wraps the start in the ability's pop-up, with the turns of a lasting weather", () => {
    const all = writes(
      '|switch|p1a: Politoed|Politoed, M|100/100',
      '|-weather|RainDance|[from] ability: Drizzle|[of] p1a: Politoed',
    )
    expect(writtenAt(all, 1)).toEqual([
      cmd('SC_ABILITY_POPUP_IN', POLITOED),
      cmd('SC_WEATHER_START', constant('BTL_WEATHER_RAIN'), weatherTurns),
      cmd('SC_ABILITY_POPUP_OUT', POLITOED),
    ])
  })

  // Scene: Tyranitar's Sunny Day. ServerControl_ChangeWeatherCore starts the sun; the held
  // client never counts the turns, so a move's sun takes the same turns (D5).
  it('starts the sun of a move alone', () => {
    const all = writes('|move|p2a: Tyranitar|Sunny Day|p2a: Tyranitar', '|-weather|SunnyDay')
    expect(writtenAt(all, 1)).toEqual([
      cmd('SC_WEATHER_START', constant('BTL_WEATHER_SUN'), weatherTurns),
    ])
  })

  it('has no sequence for an ability whose holder is out of place', () => {
    const all = writes(
      '|switch|p1a: Politoed|Politoed, M|100/100',
      '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
      '|-weather|RainDance|[from] ability: Drizzle|[of] p1: Politoed',
    )
    expect(writtenAt(all, 2)).toBeUndefined()
  })
})

// Scene: the sun ends at a turn's end, and the rain goes on. ServerControl_TurnCheckWeather puts
// SC_WEATHER_END for the weather that ends and nothing for rain that goes on (D2).
describe("a weather's turn and end", () => {
  it('ends the sun by its number', () => {
    const all = writes('|-weather|SunnyDay', '|', '|-weather|none', '|upkeep')
    expect(writtenAt(all, 2)).toEqual([cmd('SC_WEATHER_END', constant('BTL_WEATHER_SUN'))])
  })

  it('writes nothing for a turn of rain', () => {
    const all = writes('|-weather|RainDance', '|', '|-weather|RainDance|[upkeep]', '|upkeep')
    expect(writtenAt(all, 2)).toEqual([])
  })
})

// Scene: the sandstorm buffets Politoed and Blissey at the turn's end. ServerControl_WeatherDamage
// says it, plays the hit's effect at the Pokémon and moves its bar; after the last hit
// ServerControl_TurnCheckWeather plays the sandstorm over the field once.
describe("sand's damage", () => {
  const SAND = [
    '|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar',
    '|switch|p1a: Politoed|Politoed, M|100/100',
    '|switch|p2a: Blissey|Blissey, F|100/100',
    '|',
    '|-weather|Sandstorm|[upkeep]',
    '|-damage|p1a: Politoed|94/100|[from] Sandstorm',
    '|-damage|p2a: Blissey|94/100|[from] Sandstorm',
    '|upkeep',
  ]

  it('buffets each Pokémon, with the effect over the field after the last hit alone', () => {
    const all = writes(...SAND)
    expect([5, 6].map((at) => writtenAt(all, at))).toEqual([
      [
        line('sandHurts', POLITOED),
        cmd('SC_EFFECT_BY_POS', NEAR.pos, sandEffects.hit),
        cmd('SC_OP_SUBTRACT_HP', POLITOED, 6),
        cmd('SC_UPDATE_HP_GAUGE', POLITOED),
      ],
      [
        line('sandHurts', BLISSEY),
        cmd('SC_EFFECT_BY_POS', FAR.pos, sandEffects.hit),
        cmd('SC_OP_SUBTRACT_HP', BLISSEY, 6),
        cmd('SC_UPDATE_HP_GAUGE', BLISSEY),
        cmd('SC_EFFECT', sandEffects.after),
      ],
    ])
  })

  it('has no sequence for a weather with no damage line, or a damage of no weather', () => {
    const all = writes(
      '|-damage|p1a: Dugtrio|94/100|[from] RainDance',
      '|-damage|p1a: Dugtrio|90/100',
    )
    expect([0, 1].map((at) => writtenAt(all, at))).toEqual([undefined, undefined])
  })
})

// Scene: Dugtrio sets Stealth Rock on Bob's side and Tyranitar on Alice's. The handler's standard
// line names the side, and the game picks the foe's row for a side that is not the player's.
describe('Stealth Rock', () => {
  const ROCKS = [
    '|move|p1a: Dugtrio|Stealth Rock|p2a: Tyranitar',
    '|-sidestart|p2: Bob|move: Stealth Rock',
  ]

  it("says the stones float around each side, by the side's number", () => {
    const all = writes(
      ...ROCKS,
      '|move|p2a: Tyranitar|Stealth Rock|p1a: Dugtrio',
      '|-sidestart|p1: Alice|move: Stealth Rock',
    )
    expect([1, 3].map((at) => writtenAt(all, at))).toEqual([
      [line('stealthRockSet', FAR_SIDE)],
      [line('stealthRockSet', NEAR_SIDE)],
    ])
    expect(NEAR_SIDE).not.toBe(FAR_SIDE)
  })

  // Scene: Blissey comes in on the rocks. HandlerSideStealthRock hands the damage with its line to
  // ServerControl_SimpleDamageCore: the bar moves, then the line.
  it('hurts a Pokémon that comes in: HP, gauge, then the line', () => {
    const all = writes(
      ...ROCKS,
      '|switch|p2a: Blissey|Blissey, F|100/100',
      '|-damage|p2a: Blissey|88/100|[from] Stealth Rock',
    )
    expect(writtenAt(all, 3)).toEqual([
      cmd('SC_OP_SUBTRACT_HP', BLISSEY, 12),
      cmd('SC_UPDATE_HP_GAUGE', BLISSEY),
      line('stealthRockHit', BLISSEY),
    ])
  })

  // Scene: Tyranitar's Rapid Spin clears the rocks. ServerDisplay_SideEffectEnd says they are gone.
  it("says the stones are gone from the side by Rapid Spin, by the side's number", () => {
    const all = writes(
      ...ROCKS,
      '|move|p2a: Tyranitar|Rapid Spin|p1a: Dugtrio',
      '|-damage|p1a: Dugtrio|90/100',
      '|-sideend|p2: Bob|Stealth Rock|[from] move: Rapid Spin|[of] p2a: Tyranitar',
    )
    expect(writtenAt(all, 4)).toEqual([line('stealthRockEnd', FAR_SIDE)])
  })

  it('has no sequence for another side condition', () => {
    const all = writes(
      '|move|p1a: Dugtrio|Spikes|p2a: Tyranitar',
      '|-sidestart|p2: Bob|Spikes',
      '|-sideend|p2: Bob|Spikes|[from] move: Rapid Spin|[of] p2a: Tyranitar',
    )
    expect([1, 2].map((at) => writtenAt(all, at))).toEqual([undefined, undefined])
  })
})
