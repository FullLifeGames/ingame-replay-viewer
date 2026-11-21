// Moves and what they lead to (plan §6): "X used Y!" and the move's animation, which a miss, a
// still move, one without a target and one that did nothing lack, then the lines of a move's
// result.
//
// A move that did nothing plays no animation (#23). The pinned expansion's `Cmd_attackanimation`
// (src/battle_script_commands.c) plays it only
//   if (!(moveResultFlags & MOVE_RESULT_NO_EFFECT) || moveTarget == TARGET_ALL_BATTLERS)
// with (include/constants/battle.h)
//   #define MOVE_RESULT_NO_EFFECT (MOVE_RESULT_MISSED | MOVE_RESULT_FAILED |
//                                  MOVE_RESULT_PROTECTED | MOVE_RESULT_DOESNT_AFFECT_FOE)
// and its failure scripts (BattleScript_AlreadyParalyzed, BattleScript_ButItFailed, Substitute's)
// jump past `attackanimation`. A stat move plays it only `if (WillAnyStatChange())`
// (`StatChangeBeforeChange`, src/battle_move_resolution.c), which holds for a Swagger or Flatter
// that still confuses (`EFFECT_SWAGGER` sets `additionalEffectTriggers`, src/battle_stat_change.c).
// In the battle log that is a `-fail`, an `-immune` or a block (Protect) right after the move, or
// a move whose own lines change nothing on its target but stats at their limit. The game still
// animates a TARGET_ALL_BATTLERS move that did nothing (of Gen 3's moves, Perish Song); this
// module does not tell it apart.
import type { ScriptEvent } from '../../script/events'
import { moveOf } from '../tables/lookup'
import { critical, effective, failed, immune, missed, usedMove } from '../text/phrases'
import { type Context, type EventOf, sameMon } from './context'

/** The events right after a move that mean it did nothing: MISSED is the move's own `miss` flag. */
const NO_EFFECT: ReadonlySet<ScriptEvent['kind']> = new Set(['fail', 'immune', 'block'])

/** The events that start the next action. */
const ACTIONS: ReadonlySet<ScriptEvent['kind']> = new Set(['move', 'cant', 'turn'])

/**
 * The events the move in hand logs: up to the next action, or the empty line that Showdown puts
 * before the end of the turn (`case 'residual': this.add('')`, sim/battle.ts).
 */
function eventsOfMove(ctx: Context, { line }: EventOf<'move'>): ScriptEvent[] {
  const spacer = ctx.script.dropped.find((drop) => drop.line > line && drop.reason === 'spacer')
  const end = spacer?.line ?? Infinity
  const events: ScriptEvent[] = []
  for (let event = ctx.near(1); event !== undefined; event = ctx.near(events.length + 1)) {
    if (event.line > end || ACTIONS.has(event.kind)) break
    events.push(event)
  }
  return events
}

/**
 * Whether a line of the move shows that it changed something: a line on its target other than a
 * limit or a no-effect line, or its user's faint (Memento). Another Pokémon's lines do not count.
 */
function changed(event: ScriptEvent, { user, target = user }: EventOf<'move'>): boolean {
  if (event.kind === 'statLimit' || NO_EFFECT.has(event.kind)) return false
  if (event.kind === 'faint') return sameMon(event.who, user)
  return 'who' in event && sameMon(event.who, target)
}

/** Whether the move's own lines hold a stat of its target at its limit and change nothing else. */
function onlyLimits(move: EventOf<'move'>, events: readonly ScriptEvent[]): boolean {
  const target = move.target ?? move.user
  const limit = (event: ScriptEvent) => event.kind === 'statLimit' && sameMon(event.who, target)
  return events.some(limit) && !events.some((event) => changed(event, move))
}

/** Whether the move in hand did nothing: a no-effect line, or only stats at their limit. */
function didNothing(event: EventOf<'move'>, ctx: Context): boolean {
  const next = ctx.near(1)?.kind
  if (next !== undefined && NO_EFFECT.has(next)) return true
  return next === 'statLimit' && onlyLimits(event, eventsOfMove(ctx, event))
}

/** Sleep Talk and a locked move (`calledBy`) change nothing: the game says "used" each time. */
export function move(event: EventOf<'move'>, ctx: Context): void {
  const { user, target, line } = event
  const found = moveOf(event.move)
  ctx.note(line, found.fallback)
  ctx.print(line, usedMove(ctx.mon(user), event.move))
  ctx.mover = user
  if (event.miss || event.still || event.notarget || didNothing(event, ctx)) return
  const side = ctx.activeSide(user)
  ctx.emit(line, { op: 'move', user: side, target: target?.side ?? side, move: found.number })
}

export function miss({ user, target, line }: EventOf<'miss'>, ctx: Context): void {
  ctx.print(line, missed(ctx.mon(user), target && ctx.mon(target)))
}

export function immunity({ who, line }: EventOf<'immune'>, ctx: Context): void {
  ctx.print(line, immune(ctx.mon(who)))
}

export function failure({ who, effect, weak, line }: EventOf<'fail'>, ctx: Context): void {
  ctx.print(line, failed(ctx.mon(who), effect, weak))
}

/** A critical hit that no hit took in. */
export function crit({ line }: EventOf<'crit'>, ctx: Context): void {
  ctx.print(line, critical())
}

export function effectiveness(event: EventOf<'effectiveness'>, ctx: Context): void {
  ctx.print(event.line, effective(event.effectiveness))
}
