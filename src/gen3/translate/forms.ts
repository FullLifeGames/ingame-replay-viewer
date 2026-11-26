// Form changes (#65): in Gen 3 only Castform's Forecast changes a form in battle. The game plays
// `BattleScript_BattlerFormChangeWithString`: the ability pop-up (the cause's pop-up, as for any
// event an ability causes), flushtextbox, the change with `B_ANIM_FORM_CHANGE` (FORM_CHANGE), then
// "X transformed!". The weather's end turns Castform back with the same scene and its base
// species. Showdown logs no change back when Castform leaves the field; the ROM's switch-in takes
// the species of the team table again. A change by another cause plays the same scene and names
// the fallback.
//
// A Terastallization (#88) plays `BattleScript_Terastallization`'s text: flushtextbox, "X is
// storing energy!", then "X terastallized into the T type!". The stream holds no look for its
// two animations, so the line names a mechanic fallback.
import { toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { mechanicGap } from '../fallbacks'
import { speciesOf } from '../tables/lookup'
import { formChanged, terastallizing } from '../text/phrases-effects'
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
  ctx.note(line, mechanicGap('Terastallization', 'starting'))
  ctx.emit(line, { op: 'flushTextBox' })
  for (const text of terastallizing(ctx.mon(who), type)) ctx.print(line, text)
}
