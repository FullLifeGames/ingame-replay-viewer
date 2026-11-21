// Abilities (plan §6): the expansion draws an ability's pop-up (`BattleScript_AbilityPopUp`), plays
// what the ability does and takes the pop-up down. An event an ability caused runs inside its
// holder's pop-up; an `-ability` line shows the pop-up with its line, if it has one, and keeps it up
// over the stat changes it causes right after it (`BattleScript_IntimidateActivates`). An ability
// the expansion lacks is text without a pop-up (plan §4).
import type { ScriptEvent } from '../../script/events'
import type { Effect, PokemonRef } from '../../script/types'
import { abilityOf } from '../tables/lookup'
import { abilityAsText, abilityShown } from '../text/phrases-items'
import type { Context, EventOf, PopUp } from './context'

/** The kinds an `-ability` line's pop-up stays up over. */
const UNDER_POP_UP = new Set<ScriptEvent['kind']>(['statChange', 'fail'])

function showPopUp(
  ctx: Context,
  line: number,
  holder: PokemonRef,
  name: string,
): PopUp | undefined {
  const found = abilityOf(name)
  ctx.note(line, found.fallback)
  if (found.fallback !== undefined) return undefined
  const up = { line, side: ctx.activeSide(holder), ability: found.number }
  ctx.emit(line, { op: 'ability', side: up.side, ability: up.ability, show: true })
  return up
}

function hidePopUp(ctx: Context, { line, side, ability }: PopUp): void {
  ctx.emit(line, { op: 'ability', side, ability, show: false })
}

export function ability(event: EventOf<'ability'>, ctx: Context): void {
  const { who, line } = event
  const up = showPopUp(ctx, line, who, event.ability)
  const text = abilityShown(ctx.mon(who), event.ability)
  if (up === undefined) {
    ctx.print(line, text ?? abilityAsText(ctx.mon(who), event.ability))
    return
  }
  if (text !== undefined) ctx.print(line, text)
  const next = ctx.near(1)
  if (next !== undefined && UNDER_POP_UP.has(next.kind)) ctx.popUp = up
  else hidePopUp(ctx, up)
}

/** Takes an `-ability` line's pop-up down before an event it does not stay up over. */
export function closePopUp(event: ScriptEvent | undefined, ctx: Context): void {
  const up = ctx.popUp
  if (up === undefined || (event !== undefined && UNDER_POP_UP.has(event.kind))) return
  ctx.popUp = undefined
  hidePopUp(ctx, up)
}

interface Cause {
  readonly effect: Effect | undefined
  readonly holder: PokemonRef | undefined
}

const NO_CAUSE: Cause = { effect: undefined, holder: undefined }

/** `silent` is present only where a line has `[silent]`. */
const isSilent = (event: ScriptEvent) => 'silent' in event

/** The ability's holder: the healed Pokémon for a heal, else the one of `[of]` or the one hit. */
function holderOf(event: ScriptEvent): PokemonRef | undefined {
  const who = 'who' in event ? event.who : undefined
  if (event.kind === 'heal') return who
  return ('source' in event ? event.source : undefined) ?? who
}

/** The effect behind an event and its holder; a silent event shows no pop-up. */
function causeOf(event: ScriptEvent): Cause {
  if (event.kind === 'cant') return { effect: event.reason, holder: event.who }
  if (!('cause' in event) || event.kind === 'ability' || isSilent(event)) return NO_CAUSE
  return { effect: event.cause, holder: holderOf(event) }
}

/** Runs `handle` inside the pop-up of the ability that caused `event`, if one did. */
export function inCausePopUp(event: ScriptEvent, ctx: Context, handle: () => void): void {
  const { effect, holder } = causeOf(event)
  const shows = effect?.kind === 'ability' && holder !== undefined
  const up = shows ? showPopUp(ctx, event.line, holder, effect.name) : undefined
  handle()
  if (up !== undefined) hidePopUp(ctx, up)
}
