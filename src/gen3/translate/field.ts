// The field (plan §6): weather, conditions on one side and on the whole field. A weather a move
// starts is set first and then said, since the move's animation carries it; the weather of each
// turn is said and then played (`BattleScript_DamagingWeatherContinues`); a weather that ends is
// cleared, then said. A weather an ability starts is set, said and then played, inside the
// ability's pop-up (`inCausePopUp`), as `BattleScript_WeatherAbilityActivates` orders it
// (`data/battle_scripts_1.s` of the pinned expansion, the Sand Spit branch left out):
//
//   pause B_WAIT_TIME_SHORT
//   call BattleScript_AbilityPopUp
//   printfromtable gAbilityWeatherChangeStringId
//   waitstate
//   playanimation_var BS_BATTLER_0, sB_ANIM_ARG1
//
// `sB_ANIM_ARG1` is the weather's own animation, the one its upkeep plays (`src/battle_util.c`).
// Side and field conditions are a line each; the stream holds no state for them, since the game
// shows none.
import type { WeatherName } from '@pkmn/client'

import type { Anim, Weather } from '../stream/instructions'
import { fieldActivated, sideEnded, sideStarted, weatherText } from '../text/phrases-field'
import type { Context, EventOf } from './context'

interface Shown {
  readonly weather: Weather
  /** Played each turn and after an ability starts the weather. */
  readonly anim: Anim
}

const WEATHERS: Partial<Readonly<Record<WeatherName, Shown>>> = {
  Rain: { weather: 'rain', anim: 'rainContinues' },
  Sun: { weather: 'sun', anim: 'sunContinues' },
  Sand: { weather: 'sand', anim: 'sandstormContinues' },
  Hail: { weather: 'hail', anim: 'hailContinues' },
}

/** A weather the game lacks (Snow and later ones) is a line of ours alone. */
export function weather(event: EventOf<'weather'>, ctx: Context): void {
  const { line, phase } = event
  const shown = WEATHERS[event.weather]
  const text = weatherText(event.weather, phase)
  if (phase !== 'upkeep' && shown) {
    ctx.emit(line, { op: 'weather', weather: phase === 'start' ? shown.weather : 'none' })
  }
  ctx.print(line, text)
  if (shown && playsAfterText(event)) {
    ctx.emit(line, { op: 'anim', side: ctx.fieldSide(), anim: shown.anim })
  }
}

/** The upkeep and an ability's start play the weather; a move's animation carries its own. */
const playsAfterText = ({ phase, cause }: EventOf<'weather'>) =>
  phase === 'upkeep' || (phase === 'start' && cause?.kind === 'ability')

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
