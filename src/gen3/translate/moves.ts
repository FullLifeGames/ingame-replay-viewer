// Moves and what they lead to (plan §6): "X used Y!" and the move's animation, which a miss, a
// still move and one without a target lack, then the lines of a move's result.
import { moveOf } from '../tables/lookup'
import { critical, effective, failed, immune, missed, usedMove } from '../text/phrases'
import type { Context, EventOf } from './context'

/** Sleep Talk and a locked move (`calledBy`) change nothing: the game says "used" each time. */
export function move(event: EventOf<'move'>, ctx: Context): void {
  const { user, target, line } = event
  const found = moveOf(event.move)
  ctx.note(line, found.fallback)
  ctx.print(line, usedMove(ctx.mon(user), event.move))
  ctx.mover = user
  if (event.miss || event.still || event.notarget) return
  const side = ctx.activeSide(user)
  ctx.emit(line, { op: 'move', user: side, target: target?.side ?? side, move: found.number })
}

export function miss({ user, target, line }: EventOf<'miss'>, ctx: Context): void {
  ctx.print(line, missed(ctx.mon(user), target && ctx.mon(target)))
}

export function immunity({ who, line }: EventOf<'immune'>, ctx: Context): void {
  ctx.print(line, immune(ctx.mon(who)))
}

export function failure({ who, effect, line }: EventOf<'fail'>, ctx: Context): void {
  ctx.print(line, failed(ctx.mon(who), effect))
}

/** A critical hit that no hit took in. */
export function crit({ line }: EventOf<'crit'>, ctx: Context): void {
  ctx.print(line, critical())
}

export function effectiveness(event: EventOf<'effectiveness'>, ctx: Context): void {
  ctx.print(event.line, effective(event.effectiveness))
}
