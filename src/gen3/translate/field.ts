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
// A weather the stream lacks (Gen 6's and 7's Strong Winds, Harsh Sunshine and Heavy Rain) clears
// the stream's weather as it starts, so the game forgets the rain it replaced (D12); its start and
// its turns list the look the stream lacks. Snow is the stream's own since version 4 (#89).
// Side and field conditions are a line each; the stream holds no state for them, since the game
// shows none.
import type { WeatherName } from '@pkmn/client'

import { mechanicGap } from '../fallbacks'
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
  Snow: { weather: 'snow', anim: 'snowContinues' },
}

/** The look of a weather the stream lacks, listed at its start and on each of its turns. */
const LACKING: Readonly<Partial<Record<EventOf<'weather'>['phase'], string>>> = {
  start: 'starting',
  upkeep: 'continuing',
}

export function weather(event: EventOf<'weather'>, ctx: Context): void {
  const shown = WEATHERS[event.weather]
  holdWeather(event, shown, ctx)
  ctx.print(event.line, weatherText(event.weather, event.phase))
  if (shown && playsAfterText(event)) {
    ctx.emit(event.line, { op: 'anim', side: ctx.fieldSide(), anim: shown.anim })
  }
}

/**
 * The stream's weather: set as a weather starts and cleared as it ends. A weather the stream lacks
 * clears it as it starts and lists its look.
 */
function holdWeather(event: EventOf<'weather'>, shown: Shown | undefined, ctx: Context): void {
  const { line, phase } = event
  if (phase === 'start') ctx.emit(line, { op: 'weather', weather: shown?.weather ?? 'none' })
  if (phase === 'end' && shown) ctx.emit(line, { op: 'weather', weather: 'none' })
  const lacking = LACKING[phase]
  if (!shown && lacking !== undefined) ctx.note(line, mechanicGap(event.weather, lacking))
}

/** The upkeep and an ability's start play the weather; a move's animation carries its own. */
const playsAfterText = ({ phase, cause }: EventOf<'weather'>) =>
  phase === 'upkeep' || (phase === 'start' && cause?.kind === 'ability')

/** A side start by a move names its user, the Pokémon whose move the log shows last there. */
export function sideStart({ side, condition, line }: EventOf<'sideStart'>, ctx: Context): void {
  const user = ctx.mover?.side === side ? ctx.mon(ctx.mover) : undefined
  ctx.print(line, sideStarted(side, condition, user))
}

export function sideEnd(event: EventOf<'sideEnd'>, ctx: Context): void {
  const { side, condition, source, line } = event
  ctx.print(line, sideEnded(side, condition, source && ctx.mon(source)))
}

export function fieldActivate({ effect, line }: EventOf<'fieldActivate'>, ctx: Context): void {
  ctx.print(line, fieldActivated(effect))
}
