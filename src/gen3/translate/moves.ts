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
//
// Volt Absorb and Water Absorb take the move in before its animation (#36): `CanAbilityAbsorbMove`
// (src/battle_util.c) runs in `TARGET_FAILURE_TARGET_BLOCKED` (src/battle_move_resolution.c),
// which sets MOVE_RESULT_FAILED. Showdown logs it as a heal of the target by its ability right
// after the move, or an `-immune` at full HP. The rule reads no ability names.
import type { ScriptEvent } from '../../script/events'
import type { PokemonRef } from '../../script/types'
import type { Instruction } from '../stream/instructions'
import { chargeTurnOf } from '../tables/charge'
import { moveOf } from '../tables/lookup'
import { chargeLine } from '../text/phrases-charge'
import {
  critical,
  effective,
  failed,
  immune,
  missed,
  noTarget as noTargetLeft,
  oneHitKo,
  usedMove,
} from '../text/phrases'
import { type Context, type EventOf, sameMon } from './context'
import { animTurnOf, animTurnOfAnim, CHARGE_TURN } from './anim-turn'
import { startMove } from './hits'

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

/** Whether the move's target took it in by its ability: a heal by an ability, right after it. */
function absorbed(next: ScriptEvent | undefined, { user, target }: EventOf<'move'>): boolean {
  if (next?.kind !== 'heal' || next.cause?.kind !== 'ability' || target === undefined) return false
  return !sameMon(user, target) && sameMon(next.who, target)
}

/** Whether the move in hand did nothing: a no-effect line, an absorb, or only stats at limit. */
function didNothing(event: EventOf<'move'>, ctx: Context): boolean {
  const next = ctx.near(1)
  if (next !== undefined && NO_EFFECT.has(next.kind)) return true
  if (absorbed(next, event)) return true
  return next?.kind === 'statLimit' && onlyLimits(event, eventsOfMove(ctx, event))
}

/** Sleep Talk and a locked move (`calledBy`) change nothing: the game says "used" each time. */
export function move(event: EventOf<'move'>, ctx: Context): void {
  const { user, target, line } = event
  ctx.note(line, moveOf(event.move).fallback)
  ctx.print(line, usedMove(ctx.mon(user), event.move))
  ctx.mover = user
  const events = eventsOfMove(ctx, event)
  let played: Instruction | undefined
  if (!(event.miss || event.still || event.notarget || didNothing(event, ctx))) {
    played = playMove(event, target ?? user, animTurnOf(event, events, ctx), ctx)
  }
  startMove(events, played, ctx)
}

interface Played {
  readonly line: number
  readonly user: PokemonRef
  readonly move: string
}

/** The MOVE of `move` by its user at `target`'s side on the animation turn `animTurn`. */
export function playMove(
  { line, user, move: name }: Played,
  target: PokemonRef,
  animTurn: number,
  ctx: Context,
): Instruction {
  const played: Instruction = {
    op: 'move',
    user: ctx.activeSide(user),
    target: target.side,
    move: moveOf(name).number,
    animTurn,
  }
  ctx.emit(line, played)
  return played
}

/**
 * Gen 1 and 2 log a miss with no target (`|-miss|<user>`) right after the move, which names
 * one: the miss takes the move's target, so the game's "avoided" line fits.
 */
function targetOfMiss({ user, target }: EventOf<'miss'>, ctx: Context): PokemonRef | undefined {
  if (target !== undefined) return target
  const before = ctx.near(-1)
  return before?.kind === 'move' && sameMon(before.user, user) ? before.target : undefined
}

export function miss(event: EventOf<'miss'>, ctx: Context): void {
  const target = targetOfMiss(event, ctx)
  ctx.print(event.line, missed(ctx.mon(event.user), target && ctx.mon(target)))
}

export function immunity({ who, effect, line }: EventOf<'immune'>, ctx: Context): void {
  ctx.print(line, immune(ctx.mon(who), effect))
}

export function failure({ who, effect, weak, line }: EventOf<'fail'>, ctx: Context): void {
  ctx.print(line, failed(ctx.mon(who), effect, weak))
}

/** After the hit that knocked its target out: the move's result line. */
export function ohko({ line }: EventOf<'ohko'>, ctx: Context): void {
  ctx.print(line, oneHitKo())
}

/** The move said its "used" line and played no animation (`[notarget]`); now it fails. */
export function noTarget({ line }: EventOf<'noTarget'>, ctx: Context): void {
  ctx.print(line, noTargetLeft())
}

/** A critical hit that no hit took in. */
export function crit({ line }: EventOf<'crit'>, ctx: Context): void {
  ctx.print(line, critical())
}

export function effectiveness(event: EventOf<'effectiveness'>, ctx: Context): void {
  ctx.print(event.line, effective(event.effectiveness))
}

/**
 * A two-turn move's charge turn, after its `[still]` move line (`BattleScript_TwoTurnMoveCharging`):
 * the move's charge line and the charge animation, in the order its charge-turn table gives.
 */
export function prepare(event: EventOf<'prepare'>, ctx: Context): void {
  const { user, line } = event
  const charge = chargeTurnOf(event.move)
  const play = () => playMove(event, event.target ?? user, CHARGE_TURN, ctx)
  const say = () => {
    ctx.print(line, chargeLine(ctx.mon(user), event.move, charge?.stringId))
  }
  if (charge?.animationFirst === true) {
    play()
    say()
  } else {
    say()
    play()
  }
}

/** Solar Beam's hit in sun on its charge turn; a beam that misses or fails plays nothing. */
export function anim(event: EventOf<'anim'>, ctx: Context): void {
  const next = ctx.near(1)
  if (event.miss || event.notarget || (next !== undefined && NO_EFFECT.has(next.kind))) return
  playMove(event, event.target ?? event.user, animTurnOfAnim(event), ctx)
}
