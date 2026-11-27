// The names Black 2 gives @pkmn's statuses, weathers and stat stages (#109, D7): pokebw2's
// constant names, which are names and not numbers. No rule on @pkmn's names reaches them (`spa`
// is `BATTLEMON_SP_ATTACK_STAGE`, `brn` is `CONDITION_BURN`), so one record per kind lists each,
// as Gen 3's STATUS_ANIM does, and tsc holds each complete over @pkmn's type. The numbers come
// from bw2.json's battle constants at run time; scripts/gen5-bw2-effects-real.test.ts finds every
// name there under CI.
import type { WeatherName } from '@pkmn/client'
import type { BoostID, StatusName } from '@pkmn/data'

/** A battle Pokémon's status as the game holds it: its condition, and for bad poison the mark the
 * game sets in the condition's value (MakeConditionBadlyPoisoned). */
interface Gen5Status {
  readonly condition: `CONDITION_${string}`
  readonly badly: boolean
}

const status = (name: string, badly = false): Gen5Status => ({
  condition: `CONDITION_${name}`,
  badly,
})

/** Each status's condition; bad poison is poison with its mark. */
export const GEN5_STATUS: Readonly<Record<StatusName, Gen5Status>> = {
  brn: status('BURN'),
  par: status('PARALYSIS'),
  slp: status('SLEEP'),
  frz: status('FREEZE'),
  psn: status('POISON'),
  tox: status('POISON', true),
}

/** Each weather's constant; the weathers of later games have none in Black 2. */
export const GEN5_WEATHER: Readonly<Record<WeatherName, `BTL_WEATHER_${string}` | undefined>> = {
  Sun: 'BTL_WEATHER_SUN',
  Rain: 'BTL_WEATHER_RAIN',
  Sand: 'BTL_WEATHER_SANDSTORM',
  Hail: 'BTL_WEATHER_HAIL',
  Snow: undefined,
  'Harsh Sunshine': undefined,
  'Heavy Rain': undefined,
  'Strong Winds': undefined,
}

/** Each stat's stage. */
export const GEN5_STAGE: Readonly<Record<BoostID, `BATTLEMON_${string}_STAGE`>> = {
  atk: 'BATTLEMON_ATTACK_STAGE',
  def: 'BATTLEMON_DEFENSE_STAGE',
  spa: 'BATTLEMON_SP_ATTACK_STAGE',
  spd: 'BATTLEMON_SP_DEFENSE_STAGE',
  spe: 'BATTLEMON_SPEED_STAGE',
  accuracy: 'BATTLEMON_ACCURACY_STAGE',
  evasion: 'BATTLEMON_EVASION_STAGE',
}

/** The battle's constants by pokebw2's names (BattleNumbers.constants). */
type Constants = Readonly<Record<string, number>>

/** The number of the weather `weather` that the log names at `line`; throws by name for a weather
 * Black 2 lacks and for a constant the generated file lacks. */
export function gen5Weather(constants: Constants, weather: WeatherName, line: number): number {
  const constant = GEN5_WEATHER[weather]
  if (constant === undefined) {
    throw new Error(`Black 2 has no weather ${weather} (line ${String(line)})`)
  }
  const value = constants[constant]
  if (value === undefined) throw new Error(`bw2.json has no ${constant}`)
  return value
}
