// Phrases for the battle around the Pokémon (plan §5): the intro, switches, weather, conditions on
// one side or the whole field, and the end. The near player is "you" (D8: the win line is ours).
import type { WeatherName } from '@pkmn/client'
import { toID } from '@pkmn/dex'

import type { Effect, Side } from '../../script/types'
import { type Fitted, fitCharset } from './charset'
import { held, type Mon, nameAtStart, teamAtStart, teamInside } from './names'
import { ownPhrase, type Phrase, tagged } from './template'

type Phase = 'start' | 'upkeep' | 'end'

export const FIELD_TEMPLATES = {
  challenged: tagged('sText_LinkTrainerWantsToBattle', (far: string) => {
    return `You are challenged by ${far}!`
  }),
  sentOut: tagged('sText_LinkTrainerSentOutPkmn', (far: string, mon: string) => {
    return `${far} sent out ${mon}!`
  }),
  go: tagged('sText_GoPkmn2', (mon: string) => `Go! ${mon}!`),
  comeBack: tagged('sText_PkmnComeBack', (mon: string) => `${mon}, come back!`),
  withdrew: tagged('sText_LinkTrainer1WithdrewPkmn', (far: string, mon: string) => {
    return `${far} withdrew ${mon}!`
  }),
  dragged: tagged(
    'STRINGID_PKMNWASDRAGGEDOUT',
    (who: Mon) => `${nameAtStart(who)} was dragged out!`,
  ),
  rainStart: tagged('STRINGID_STARTEDTORAIN', () => 'It started to rain!'),
  sandStart: tagged('STRINGID_SANDSTORMBREWED', () => 'A sandstorm kicked up!'),
  sunStart: tagged('STRINGID_SUNLIGHTGOTBRIGHT', () => 'The sunlight turned harsh!'),
  hailStart: tagged('STRINGID_STARTEDHAIL', () => 'It started to hail!'),
  rainUpkeep: tagged('STRINGID_RAINCONTINUES', () => 'Rain continues to fall.'),
  sandUpkeep: tagged('STRINGID_SANDSTORMRAGES', () => 'The sandstorm is raging.'),
  sunUpkeep: tagged('STRINGID_SUNLIGHTSTRONG', () => 'The sunlight is strong.'),
  hailUpkeep: tagged('STRINGID_HAILCONTINUES', () => 'The hail is crashing down.'),
  rainEnd: tagged('STRINGID_RAINSTOPPED', () => 'The rain stopped.'),
  sandEnd: tagged('STRINGID_SANDSTORMSUBSIDED', () => 'The sandstorm subsided.'),
  sunEnd: tagged('STRINGID_SUNLIGHTFADED', () => 'The sunlight faded.'),
  hailEnd: tagged('STRINGID_HAILSTOPPED', () => 'The hail stopped.'),
  electricWeakened: tagged(
    'STRINGID_ELECTRICITYWEAKENED',
    () => "Electricity's power was weakened!",
  ),
  fireWeakened: tagged('STRINGID_FIREWEAKENED', () => "Fire's power was weakened!"),
  spikes: tagged('STRINGID_SPIKESSCATTERED', (team: string) => {
    return `Spikes were scattered on the ground all around ${team} side!`
  }),
  reflect: tagged('STRINGID_PKMNRAISEDDEF', (team: string) => {
    return `Reflect made ${team} side stronger against physical moves!`
  }),
  lightScreen: tagged('STRINGID_PKMNRAISEDSPDEF', (team: string) => {
    return `Light Screen made ${team} side stronger against special moves!`
  }),
  safeguard: tagged('STRINGID_PKMNCOVEREDBYVEIL', (Team: string) => {
    return `${Team} side became cloaked in a mystical veil!`
  }),
  // B_MSG_SET_MIST in `gMistUsedStringIds` (`BattleScript_EffectMist`), with the user as B_ATK.
  mist: tagged('gText_PkmnShroudedInMist', (who: Mon) => {
    return `${nameAtStart(who)} surrounds itself with a protective mist!`
  }),
  stealthRock: tagged('STRINGID_POINTEDSTONESFLOAT', (team: string) => {
    return `Pointed stones float in the air on ${team} side!`
  }),
  spikesGone: tagged('STRINGID_PKMNBLEWAWAYSPIKES', (who: Mon) => {
    return `${nameAtStart(who)} blew away Spikes!`
  }),
  // Gen 4's line for Rapid Spin, kept in the pinned file "Not in gen 5+", as Spikes' above.
  stealthRockGone: tagged('STRINGID_PKMNBLEWAWAYSTEALTHROCK', (who: Mon) => {
    return `${nameAtStart(who)} blew away Stealth Rock!`
  }),
  stealthRockCleared: tagged('STRINGID_STEALTHROCKDISAPPEAREDFROMTEAM', (team: string) => {
    return `The pointed stones disappeared from ${team} side!`
  }),
  reflectGone: tagged(
    'STRINGID_REFLECTWOREOFF',
    (Team: string) => `${Team} side's Reflect wore off!`,
  ),
  lightScreenGone: tagged('STRINGID_LIGHTSCREENWOREOFF', (Team: string) => {
    return `${Team} side's Light Screen wore off!`
  }),
  safeguardGone: tagged('STRINGID_PKMNSAFEGUARDEXPIRED', (Team: string) => {
    return `${Team} side is no longer protected by the mystical veil!`
  }),
  woreOff: tagged('STRINGID_PKMNSXWOREOFF', (Team: string, condition: string) => {
    return `${Team} side's ${condition} wore off!`
  }),
  perishSong: tagged('STRINGID_FAINTINTHREE', () => {
    return 'All Pokémon that heard the song will faint in three turns!'
  }),
}

const T = FIELD_TEMPLATES

/** The far player's challenge that opens a battle (plan §13); `far` is the name for text. */
export const challenged = (far: string) => T.challenged.render(far)

/** A Pokémon sent out: by the far trainer's name, or with "Go!" on the near side. */
export function sentOut(mon: Mon, trainer: string): string {
  return mon.side === 'far' ? T.sentOut.render(trainer, mon.name) : T.go.render(mon.name)
}

/** A Pokémon called back before a switch. */
export function withdrawn(mon: Mon, trainer: string): string {
  return mon.side === 'far' ? T.withdrew.render(trainer, mon.name) : T.comeBack.render(mon.name)
}

export const draggedOut = (who: Mon) => T.dragged.render(who)

type Gen3Weather = Extract<WeatherName, 'Rain' | 'Sand' | 'Sun' | 'Hail'>

const WEATHER: Readonly<Record<Gen3Weather, Readonly<Record<Phase, () => string>>>> = {
  Rain: { start: T.rainStart.render, upkeep: T.rainUpkeep.render, end: T.rainEnd.render },
  Sand: { start: T.sandStart.render, upkeep: T.sandUpkeep.render, end: T.sandEnd.render },
  Sun: { start: T.sunStart.render, upkeep: T.sunUpkeep.render, end: T.sunEnd.render },
  Hail: { start: T.hailStart.render, upkeep: T.hailUpkeep.render, end: T.hailEnd.render },
}

const isGen3Weather = (weather: WeatherName): weather is Gen3Weather => weather in WEATHER

/** The weather's start (by a move or an ability alike), its turn's end and its end. */
export function weatherText(weather: WeatherName, phase: Phase): Phrase {
  if (isGen3Weather(weather)) return { text: WEATHER[weather][phase]() }
  const own = `The weather changed to ${held(weather)}!`
  return ownPhrase(own, `${weather} at its ${phase}`)
}

const SIDE_STARTS: Readonly<Record<string, (side: Side) => string>> = {
  spikes: (side) => T.spikes.render(teamInside(side)),
  stealthrock: (side) => T.stealthRock.render(teamInside(side)),
  reflect: (side) => T.reflect.render(teamInside(side)),
  lightscreen: (side) => T.lightScreen.render(teamInside(side)),
  safeguard: (side) => T.safeguard.render(teamAtStart(side)),
}

/**
 * The screens Gen 1 sets on their user (`|-start|<mon>|Reflect`) say the side message of the
 * user's side, as in Gen 3, where they guard the whole side.
 */
export function screenRaised(side: Side, id: string): string | undefined {
  return id === 'reflect' || id === 'lightscreen' ? SIDE_STARTS[id]?.(side) : undefined
}

/** The side starts whose line names the Pokémon that set them, by the condition's id. */
const SIDE_STARTS_BY_USER: Readonly<Record<string, (user: Mon) => string>> = {
  mist: T.mist.render,
}

/**
 * A condition set on one side, such as Spikes on the side they hurt; `user` is the Pokémon on
 * that side whose move set it, if one did.
 */
export function sideStarted(side: Side, condition: Effect, user?: Mon): Phrase {
  const id = toID(condition.name)
  const byUser = SIDE_STARTS_BY_USER[id]
  const text = user && byUser ? byUser(user) : SIDE_STARTS[id]?.(side)
  if (text !== undefined) return { text }
  const own = `${held(condition.name)} took effect on ${teamInside(side)} side!`
  return ownPhrase(own, `${condition.name} starting on a side`)
}

const SIDE_ENDS: Readonly<Record<string, (side: Side) => string>> = {
  stealthrock: (side) => T.stealthRockCleared.render(teamInside(side)),
  reflect: (side) => T.reflectGone.render(teamAtStart(side)),
  lightscreen: (side) => T.lightScreenGone.render(teamAtStart(side)),
  safeguard: (side) => T.safeguardGone.render(teamAtStart(side)),
}

/** The hazards whose end names the Pokémon that blew them away, by the condition's id. */
const SIDE_ENDS_BY_SOURCE: Readonly<Record<string, (source: Mon) => string>> = {
  spikes: T.spikesGone.render,
  stealthrock: T.stealthRockGone.render,
}

/** A condition gone from a side; `source` blew a hazard away, as with Rapid Spin. */
export function sideEnded(side: Side, condition: Effect, source: Mon | undefined): Phrase {
  const id = toID(condition.name)
  const bySource = SIDE_ENDS_BY_SOURCE[id]
  const text = source && bySource ? bySource(source) : SIDE_ENDS[id]?.(side)
  if (text !== undefined) return { text }
  const own = T.woreOff.render(teamAtStart(side), held(condition.name))
  return ownPhrase(own, `${condition.name} ending on a side`)
}

export function fieldActivated(effect: Effect): Phrase {
  if (toID(effect.name) === 'perishsong') return { text: T.perishSong.render() }
  return ownPhrase(`${held(effect.name)} took effect!`, `${effect.name} on the field`)
}

/** The win line (D8); `trainer` is the winner's name for text. */
export const won = (trainer: string) => `${trainer} won the battle!`

export const tie = () => 'The battle ended in a tie!'

/** A line of the simulator's own, such as a forfeit, as it reads. */
export const simulatorMessage = (text: string): Fitted => fitCharset(text)
