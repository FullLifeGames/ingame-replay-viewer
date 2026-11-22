// A move's hits (plan §6) and multi-hit moves (#15), as the pinned expansion plays them. A hit
// plays its sound and hit animation; the critical hit and effectiveness lines follow the bar.
//
// A multi-hit move says "used" once (`CancelerAttackstring`, src/battle_move_resolution.c), then
// `MoveEndMultihitMove` restarts the canceler for every later hit, so each hit plays the move's
// animation (`CancelerMoveAnimation`), the hit, the bar and its critical hit line. The
// effectiveness waits for the last hit (`Cmd_resultmessage`, src/battle_script_commands.c);
// `BattleScript_MultiHitPrintStrings` (data/battle_scripts_1.s) says it, then the count line.
// `MOVEEND_FAINT_BLOCK` runs before `MOVEEND_MULTIHIT_MOVE`, so a target that the last hit knocks
// out faints before both lines (upstream's test/battle/move_effect/multi_hit.c). Showdown logs
// `-hitcount` once after the last hit and the faint after it (data/mods/gen3/scripts.ts).
import type { ScriptEvent } from '../../script/events'
import type { PokemonRef, Side } from '../../script/types'
import type { Instruction } from '../stream/instructions'
import { critical, effective, hitCount as countLine } from '../text/phrases'
import { type Context, type EventOf, sameMon } from './context'

type Struck = EventOf<'damage' | 'effectEnd' | 'effectActivate'>

/** After `move` played its MOVE, or none: a move whose lines count its hits is a multi-hit one. */
export function startMove(
  events: readonly ScriptEvent[],
  played: Instruction | undefined,
  ctx: Context,
): void {
  const count = events.find((event) => event.kind === 'hitCount')
  ctx.multiHit = count && {
    move: played,
    faints: events.some(
      (event) => event.kind === 'faint' && event.line > count.line && sameMon(event.who, count.who),
    ),
    hits: 0,
    effectiveness: undefined,
  }
}

/** One hit on `side`; a multi-hit move plays its MOVE again before every hit after the first. */
export function hit(
  line: number,
  side: Side,
  effectiveness: Struck['effectiveness'],
  ctx: Context,
): void {
  const multiHit = ctx.multiHit
  if (multiHit !== undefined) {
    if (multiHit.hits > 0 && multiHit.move !== undefined) ctx.emit(line, multiHit.move)
    multiHit.hits += 1
  }
  ctx.emit(line, { op: 'hit', side, effectiveness: effectiveness ?? 'normal' })
}

/** The lines after a hit: a critical hit, then the effectiveness, which a multi-hit move holds. */
export function hitLines(event: Struck, ctx: Context): void {
  if (event.crit) ctx.print(event.line, critical())
  if (event.effectiveness === undefined) return
  if (ctx.multiHit === undefined) ctx.print(event.line, effective(event.effectiveness))
  else ctx.multiHit.effectiveness = event.effectiveness
}

/** The held effectiveness and the count line, or both held for the faint of the target. */
export function hitCount({ who, hits, line }: EventOf<'hitCount'>, ctx: Context): void {
  const multiHit = ctx.multiHit
  ctx.multiHit = undefined
  const held = multiHit?.effectiveness
  const texts = [...(held === undefined ? [] : [effective(held)]), countLine(hits)]
  if (multiHit?.faints === true) ctx.afterFaint = { who, line, texts }
  else for (const text of texts) ctx.print(line, text)
}

/** After the "fainted!" line of `who`: the lines its multi-hit move held for it. */
export function afterFaint(who: PokemonRef, ctx: Context): void {
  const held = ctx.afterFaint
  if (held === undefined || !sameMon(held.who, who)) return
  ctx.afterFaint = undefined
  for (const text of held.texts) ctx.print(held.line, text)
}
