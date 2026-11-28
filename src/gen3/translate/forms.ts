// Form changes (#65): in Gen 3 only Castform's Forecast changes a form in battle. The game plays
// `BattleScript_BattlerFormChangeWithString`: the ability pop-up (the cause's pop-up, as for any
// event an ability causes), flushtextbox, the change with `B_ANIM_FORM_CHANGE` (FORM_CHANGE), then
// "X transformed!". The weather's end turns Castform back with the same scene and its base
// species. Showdown logs no change back when Castform leaves the field; the ROM's switch-in takes
// the species of the team table again. A change by another cause plays the same scene and names
// the fallback.
//
// A Terastallization (#88, #89) plays `BattleScript_Terastallization`: flushtextbox, "X is
// storing energy!", TERA with the game's number of the type, which plays the two animations and
// leaves the tint and the type's mark, then "X terastallized into the T type!". A type the game
// lacks keeps both lines and names a mechanic fallback.
//
// A Mega Evolution (#125) plays `BattleScript_MegaEvolution`: flushtextbox, "X's stone is
// reacting to P's Mega Ring!", the form change, then "X has Mega Evolved into Mega S!". Rayquaza
// takes `BattleScript_WishMegaEvolution`, whose wish line comes first in place of the stone's.
// The change is FORM_CHANGE, the scene Castform's Forecast plays; the Mega animation and mark
// follow with #126 and name a mechanic fallback. A forme the game lacks keeps both lines. A Mega
// that comes back in shows its form before Mega Evolution, since the ROM's switch-in takes the
// species of the team table: each comeback names a mechanic fallback until #126 keeps the form.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { mechanicGap, megaReturnGap, teraTypeGap } from '../fallbacks'
import { speciesOf, typeOf } from '../tables/lookup'
import { formChanged, megaEvolving, terastallizing } from '../text/phrases-effects'
import type { Context, EventOf } from './context'

const FORECAST = 'forecast'

const isForecast = (cause: Effect | undefined) =>
  cause?.kind === 'ability' && toID(cause.name) === FORECAST

function notByForecast(species: string, cause: Effect | undefined) {
  const by = cause === undefined ? 'no cause' : cause.name
  return {
    kind: 'form',
    detail: `${species} by ${by}: Gen 3 changes forms by Forecast only`,
  } as const
}

export function formChange(event: EventOf<'formChange'>, ctx: Context): void {
  const { who, line, species, cause } = event
  const side = ctx.activeSide(who)
  const found = speciesOf(species)
  ctx.note(line, found.fallback)
  if (!isForecast(cause)) ctx.note(line, notByForecast(species, cause))
  ctx.emit(line, { op: 'flushTextBox' })
  ctx.emit(line, { op: 'formChange', side, species: found.number })
  ctx.print(line, formChanged(ctx.mon(who)))
}

export function terastallize(event: EventOf<'terastallize'>, ctx: Context): void {
  const { who, line, type } = event
  const [storing, into] = terastallizing(ctx.mon(who), type)
  const teraType = typeOf(type)
  ctx.emit(line, { op: 'flushTextBox' })
  ctx.print(line, storing)
  if (teraType === undefined) ctx.note(line, teraTypeGap(type))
  else ctx.emit(line, { op: 'tera', side: ctx.activeSide(who), teraType })
  ctx.print(line, into)
}

export function megaEvolve(event: EventOf<'megaEvolve'>, ctx: Context): void {
  const { who, line, species, item } = event
  const trainer = ctx.player(who.side).text
  const [reacting, evolved] = megaEvolving(ctx.mon(who), item, trainer, species)
  const found = speciesOf(species)
  ctx.emit(line, { op: 'flushTextBox' })
  ctx.print(line, reacting)
  ctx.note(line, found.fallback)
  if (found.fallback === undefined) {
    ctx.emit(line, { op: 'formChange', side: ctx.activeSide(who), species: found.number })
    ctx.megas[who.side].set(who.index, species)
  }
  ctx.print(line, evolved)
  ctx.note(line, mechanicGap('Mega Evolution', 'starting'))
}

/** A switch-in of a team member that Mega Evolved: it shows the form before (#125, D5). */
export function megaComeback({ who, line }: EventOf<'switchIn'>, ctx: Context): void {
  const species = ctx.megas[who.side].get(who.index)
  if (species !== undefined) ctx.note(line, megaReturnGap(species))
}
