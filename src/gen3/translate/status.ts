// Status conditions (plan §6), in the order of the expansion's scripts: a status given plays its
// animation, says it and then updates the icon (`BattleScript_MoveEffectToxic`); Rest says it
// with no animation (`BattleScript_EffectRest`); a cure says it, then updates the icon; a Pokémon
// held back by its status says so and then plays the status animation
// (`BattleScript_MoveUsedIsParalyzed`).
import type { StatusName } from '@pkmn/data'
import { toID } from '@pkmn/dex'

import type { ScriptEvent } from '../../script/events'
import type { PokemonRef } from '../../script/types'
import type { Anim, Status } from '../stream/instructions'
import {
  cant as heldBack,
  itemCured,
  rested,
  statusCured,
  statusGiven,
  teamCured,
} from '../text/phrases-status'
import { type Context, type EventOf, sameMon } from './context'
import { eatenBefore } from './items'

/** Each status's animation; a status given, one held back and one that hurts all play it. */
export const STATUS_ANIM: Readonly<Record<StatusName, Anim>> = {
  slp: 'statusSlp',
  psn: 'statusPsn',
  tox: 'statusPsn',
  brn: 'statusBrn',
  par: 'statusPrz',
  frz: 'statusFrz',
}

/** The statuses that hold a Pokémon back play their animation after the line. */
const HELD_BACK_ANIM: Partial<Readonly<Record<string, Anim>>> = {
  slp: STATUS_ANIM.slp,
  frz: STATUS_ANIM.frz,
  par: STATUS_ANIM.par,
}

export function status(event: EventOf<'status'>, ctx: Context): void {
  const { who, line } = event
  const side = ctx.activeSide(who)
  if (event.cause !== undefined && toID(event.cause.name) === 'rest') {
    ctx.print(line, rested(ctx.mon(who)))
  } else {
    ctx.emit(line, { op: 'anim', side, anim: STATUS_ANIM[event.status] })
    ctx.print(line, statusGiven(ctx.mon(who), event.status))
  }
  ctx.emit(line, { op: 'status', side, slot: who.index, status: event.status })
}

/** A silent cure, such as Natural Cure on the way out, clears the status without a word. */
export function cureStatus(event: EventOf<'cureStatus'>, ctx: Context): void {
  const { who, line } = event
  if (!event.silent) ctx.print(line, cureText(event, ctx))
  ctx.emit(line, { op: 'status', side: who.side, slot: who.index, status: 'none' })
}

/** A cure by a berry eaten on the line before, or by an item the log names, names the item. */
function cureText(event: EventOf<'cureStatus'>, ctx: Context): string {
  const { who, status, cause } = event
  const item = eatenBefore(who, ctx) ?? (cause?.kind === 'item' ? cause.name : undefined)
  const mon = ctx.mon(who)
  return item === undefined ? statusCured(mon, status) : itemCured(mon, item, status)
}

/** Heal Bell and Aromatherapy: the line, then each member with a status is cleared. */
export function cureTeam(event: EventOf<'cureTeam'>, ctx: Context): void {
  const { who, line } = event
  ctx.print(line, teamCured(ctx.mon(who), event.cause))
  for (const index of ctx.script.teams[who.side].keys()) {
    if (statusOf(ctx, { side: who.side, index }) === 'none') continue
    ctx.emit(line, { op: 'status', side: who.side, slot: index, status: 'none' })
  }
}

export function cant(event: EventOf<'cant'>, ctx: Context): void {
  const { who, reason, line } = event
  const side = ctx.activeSide(who)
  ctx.print(line, heldBack(ctx.mon(who), reason, event.move))
  const anim = HELD_BACK_ANIM[reason.name]
  if (anim !== undefined) ctx.emit(line, { op: 'anim', side, anim })
}

type Carried = (event: ScriptEvent) => Status

/** A switch or an HP line without a status shows the Pokémon has none. */
const carried: Carried = (event) => ('status' in event ? event.status : undefined) ?? 'none'

/** The events that show a team member's status, and what each says it is. */
const SHOWN: Partial<Readonly<Record<ScriptEvent['kind'], Carried>>> = {
  switchIn: carried,
  damage: carried,
  heal: carried,
  status: carried,
  cureStatus: () => 'none',
}

function statusIn(event: ScriptEvent, ref: PokemonRef): Status | undefined {
  if (event.kind === 'cureTeam') return event.who.side === ref.side ? 'none' : undefined
  const read = SHOWN[event.kind]
  return read && 'who' in event && sameMon(event.who, ref) ? read(event) : undefined
}

/** The status of `ref` before the event in hand, by the last event that showed it. */
function statusOf(ctx: Context, ref: PokemonRef): Status {
  for (const event of ctx.script.events.slice(0, ctx.at).toReversed()) {
    const found = statusIn(event, ref)
    if (found !== undefined) return found
  }
  return 'none'
}
