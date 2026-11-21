// The field (plan §6): weather, conditions on one side and on the whole field. A weather a move
// starts is set first and then said, since the move's animation carries it; the weather of each
// turn is said and then played (`BattleScript_DamagingWeatherContinues`); a weather that ends is
// cleared, then said. Side and field conditions are a line each; the stream holds no state for
// them, since the game shows none.
import type { WeatherName } from '@pkmn/client'

import type { Anim, Weather } from '../stream/instructions'
import { fieldActivated, sideEnded, sideStarted, weatherText } from '../text/phrases-field'
import type { Context, EventOf } from './context'

interface Shown {
  readonly weather: Weather
  readonly upkeep: Anim
}

const WEATHERS: Partial<Readonly<Record<WeatherName, Shown>>> = {
  Rain: { weather: 'rain', upkeep: 'rainContinues' },
  Sun: { weather: 'sun', upkeep: 'sunContinues' },
  Sand: { weather: 'sand', upkeep: 'sandstormContinues' },
  Hail: { weather: 'hail', upkeep: 'hailContinues' },
}

/** A weather the game lacks (Snow and later ones) is a line of ours alone. */
export function weather(event: EventOf<'weather'>, ctx: Context): void {
  const { line, phase } = event
  const shown = WEATHERS[event.weather]
  const text = weatherText(event.weather, phase)
  if (phase === 'upkeep') {
    ctx.print(line, text)
    if (shown) ctx.emit(line, { op: 'anim', side: ctx.fieldSide(), anim: shown.upkeep })
    return
  }
  if (shown) ctx.emit(line, { op: 'weather', weather: phase === 'start' ? shown.weather : 'none' })
  ctx.print(line, text)
}

export function sideStart({ side, condition, line }: EventOf<'sideStart'>, ctx: Context): void {
  ctx.print(line, sideStarted(side, condition))
}

export function sideEnd(event: EventOf<'sideEnd'>, ctx: Context): void {
  const { side, condition, source, line } = event
  ctx.print(line, sideEnded(side, condition, source && ctx.mon(source)))
}

export function fieldActivate({ effect, line }: EventOf<'fieldActivate'>, ctx: Context): void {
  ctx.print(line, fieldActivated(effect))
}
