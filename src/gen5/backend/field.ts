// The server's sequences of the field (#109, lane plan D2, D5): a weather's start by a move or by
// an ability, its end, its turn, sand's and hail's damage, and Stealth Rock's set, hit and end,
// each in the order pokebw2's src/battle/btl_server_flow.c puts it into the queue. The client
// prints a weather's start and end lines itself (BattleClient_ScWeatherStart,
// BattleClient_ScWeatherEnd in btl_client.c), and Black 2 has no look of its own for a hazard, so
// Stealth Rock shows as lines alone. Pure: every number of the game comes in from
// build/gen5/bw2.json.
import type { WeatherName } from '@pkmn/client'

import type { Side } from '../../script/types.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import { gen5Weather } from './effect-names.ts'
import { type EffectScene, message, type Sequences, simpleHp } from './effect-scene.ts'
import type { Gen5Line } from './lines.ts'
import { gen5 } from './names.ts'
import type { EventOf } from './rules.ts'
import { clientOf } from './slots.ts'

/** The line ServerControl_WeatherDamage sets up by the field's weather; the other weathers hurt
 * no one. */
const DAMAGE_LINES: Readonly<Partial<Record<WeatherName, Gen5Line>>> = {
  Sand: LINES.sandHurts,
  Hail: LINES.hailHurts,
}

/** Stealth Rock, the one hazard whose lines the backend sends, by @pkmn's Gen 5 condition. */
const isStealthRock = (name: string) => gen5.conditions.get(name)?.id === 'stealthrock'

/** A weather by @pkmn's Gen 5 data, as the cause of a damage names it. */
const isWeather = (name: string) => gen5.conditions.get(name)?.effectType === 'Weather'

/** GetClientSide: the side argument of a side's lines, from the side's client. */
const sideOf = (scene: EffectScene, side: Side) =>
  clientOf(scene.numbers.battle.single, side) & scene.numbers.effects.sideMask

/** The weather the field holds at the event: the last weather line before it, none after an
 * end. */
function fieldWeather(scene: EffectScene): WeatherName | undefined {
  const last = scene.events.slice(0, scene.at).findLast((event) => event.kind === 'weather')
  return last?.kind === 'weather' && last.phase !== 'end' ? last.weather : undefined
}

/** A weather's start, end or turn:
 * - start: ServerControl_ChangeWeatherCore's SC_WEATHER_START with the turns of a weather that
 *   lasts (D5); by an ability, BattleHandler_ChangeWeather wraps it in the holder's pop-up;
 * - end: ServerControl_TurnCheckWeather's SC_WEATHER_END with the weather that ends;
 * - turn: nothing, as ServerControl_TurnCheckWeather puts nothing for a weather that goes on (D2). */
function weatherCommands(scene: EffectScene, event: EventOf<'weather'>) {
  if (event.phase === 'upkeep') return []
  const weather = gen5Weather(scene.numbers.battle.constants, event.weather, event.line)
  if (event.phase === 'end') return [{ command: 'SC_WEATHER_END', args: [weather] }]
  const start = { command: 'SC_WEATHER_START', args: [weather, scene.numbers.effects.weatherTurns] }
  const { cause, source } = event
  if (cause === undefined) return [start]
  const holder = source && scene.state.inPlace(source)
  if (cause.kind !== 'ability' || holder === undefined) return undefined
  return [
    { command: 'SC_ABILITY_POPUP_IN', args: [holder.monId] },
    start,
    { command: 'SC_ABILITY_POPUP_OUT', args: [holder.monId] },
  ]
}

/** The line of a damage by a weather: the one the field's weather hurts with, if it hurts. */
function weatherLine(scene: EffectScene, event: EventOf<'damage'>): Gen5Line | undefined {
  const name = event.cause?.name
  const weather = fieldWeather(scene)
  return name !== undefined && isWeather(name) && weather !== undefined
    ? DAMAGE_LINES[weather]
    : undefined
}

/** ServerControl_WeatherDamage: the weather's line, the hit's effect at the Pokémon, and
 * ServerControl_SimpleDamageCore's HP and gauge; after the turn's last such hit
 * ServerControl_TurnCheckWeather plays the field's effect once. */
function weatherDamage(scene: EffectScene, event: EventOf<'damage'>) {
  const line = weatherLine(scene, event)
  const who = scene.state.inPlace(event.who)
  if (line === undefined || who === undefined) return undefined
  const { hit, after } = scene.numbers.effects.sandEffects
  const next = scene.events[scene.at + 1]
  const last = next?.kind !== 'damage' || next.cause?.name !== event.cause?.name
  return [
    message(scene, line, [who.monId]),
    { command: 'SC_EFFECT_BY_POS', args: [who.pos, hit] },
    ...simpleHp(scene, event.who, event.hp, who.monId),
    ...(last ? [{ command: 'SC_EFFECT', args: [after] }] : []),
  ]
}

/** HandlerSideStealthRock's damage through BattleHandler_Damage and
 * ServerControl_SimpleDamageCore: HP and gauge, then the handler's line. */
function stealthRockHit(scene: EffectScene, event: EventOf<'damage'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || event.cause === undefined || !isStealthRock(event.cause.name)) {
    return undefined
  }
  return [
    ...simpleHp(scene, event.who, event.hp, who.monId),
    message(scene, LINES.stealthRockHit, [who.monId]),
  ]
}

/** Stealth Rock's set, HandlerStealthRock's standard line through CommonCreateSideEffect, or its
 * end, ServerDisplay_SideEffectEnd's, which Rapid Spin's clearing shows too
 * (BattleHandler_RemoveSideEffectCore); each names the side. */
const sideLine =
  (line: Gen5Line) =>
  (scene: EffectScene, event: EventOf<'sideStart' | 'sideEnd'>): ServerCommand[] | undefined =>
    isStealthRock(event.condition.name)
      ? [message(scene, line, [sideOf(scene, event.side)])]
      : undefined

/** The field's sequences by the kind of event they write. */
export const FIELD_SEQUENCES = {
  weather: weatherCommands,
  damage: (scene, event) => weatherDamage(scene, event) ?? stealthRockHit(scene, event),
  sideStart: sideLine(LINES.stealthRockSet),
  sideEnd: sideLine(LINES.stealthRockEnd),
} as const satisfies Sequences
