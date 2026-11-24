// A Pokémon that its charge turn hid (#65): Fly, Dig, Dive and Bounce, the charge moves whose
// table entry is `semiInvulnerable`. Their charge animation hides the user's sprite; the pinned
// expansion shows it again in one of three ways, and the engine tests of
// rom/gen3/test/replay_hidden.c ("Replay: engine: …") pin each:
//
// - The hit lands: the hit's own animation shows the user (MOVE on animation turn 1). No op.
// - The hit turn hits nothing, or the user cannot take it: `MoveEndAttackerVisible`
//   (src/battle_move_resolution.c) shows the user in move end, after the result line (a miss,
//   Protect, an immunity, an absorbing ability, no target), after a `cant` line and its status
//   animation, or after the HP of a confusion self-hit that leaves it standing. The stream plays
//   SHOW_MON there.
// - A move that hits the hidden Pokémon (Thunder or Gust on Fly, Earthquake on Dig) plays no hit
//   animation on an invisible sprite and leaves it hidden.
//
// A hidden Pokémon that faints (from a confusion self-hit too), or whose side sends in another,
// needs no show; neither does one at the end of the battle. A future attack's hit by a hidden
// Pokémon (`futureHit` in effects.ts) plays from the hidden sprite and changes nothing here.
//
// Two cases differ from the game:
// - Yawn's sleep on a hidden Pokémon: the game shows it at "fell asleep!" (`makevisible` in
//   BattleScript_YawnMakesAsleep); this module shows it at the next turn's `cant` line.
// - Gen 1 keeps a Fly or Dig user out of reach after a full paralysis or Disable stopped its hit;
//   the Gen 3 game has no such state, so the stream shows it at the `cant` and notes the gap.
//
// The game cannot let a hidden Pokémon play any MOVE but its hit. Should a log do so, this module
// shows it first: a missing show would leave it hidden for the rest of the battle.
import { toID } from '@pkmn/dex'

import type { ScriptEvent } from '../../script/events'
import type { PokemonRef, Side } from '../../script/types'
import { mechanicGap } from '../fallbacks'
import type { Instruction } from '../stream/instructions'
import { chargeTurnOf } from '../tables/charge'
import { HIT_TURN } from './anim-turn'
import { type Context, type EventOf, type Hidden, sameMon } from './context'

const SIDES: readonly Side[] = ['near', 'far']

/** The `cant` reasons after which Gen 1 keeps the user out of reach. */
const KEEPS_OUT_OF_REACH_IN_GEN_1: ReadonlySet<string> = new Set(['par', 'disable'])

/** A move by its user, as `move`, `prepare` and `anim` events name it. */
interface ByUser {
  readonly line: number
  readonly user: PokemonRef
  readonly move: string
}

function show(side: Side, line: number, ctx: Context): void {
  ctx.emit(line, { op: 'showMon', side })
  ctx.hidden[side] = undefined
}

/** The hidden Pokémon that `user` is, if it is one. */
function hiddenAs(user: PokemonRef, ctx: Context): Hidden | undefined {
  const hidden = ctx.hidden[user.side]
  return hidden !== undefined && sameMon(hidden.who, user) ? hidden : undefined
}

/** After a charge turn: a charge that hides its user keeps it hidden until its hit turn. */
export function hide({ user, move }: EventOf<'prepare'>, ctx: Context): void {
  if (chargeTurnOf(move)?.semiInvulnerable === true) ctx.hidden[user.side] = { who: user, move }
}

/** Before a MOVE by `user`: a hidden user shows first, unless the MOVE is its hit. */
export function showBeforeMove({ line, user, move }: ByUser, animTurn: number, ctx: Context): void {
  const hidden = hiddenAs(user, ctx)
  if (hidden === undefined) return
  if (toID(hidden.move) !== toID(move) || animTurn !== HIT_TURN) show(user.side, line, ctx)
}

/**
 * After a move line of a hidden user: a played hit has shown it; a hit turn without a MOVE shows
 * it after the move's result line, its first event (`events`), or after the move line when the
 * move has none.
 */
export function afterHitTurn(
  { user }: EventOf<'move'>,
  played: Instruction | undefined,
  events: readonly ScriptEvent[],
  ctx: Context,
): void {
  const hidden = hiddenAs(user, ctx)
  if (hidden === undefined) return
  if (played === undefined) hidden.pendingAt = events.length > 0 ? ctx.at + 1 : ctx.at
  else ctx.hidden[user.side] = undefined
}

/** Whether `event` ends the hidden state with no show: a faint, or a switch on its side. */
const endsHidden = (event: ScriptEvent, { who }: Hidden) =>
  (event.kind === 'faint' && sameMon(event.who, who)) ||
  (event.kind === 'switchIn' && event.who.side === who.side)

/**
 * Whether `event` is the last of a hit turn that hit nothing. A confusion self-hit that knocks the
 * user out is not: the game's faint slide plays on the hidden sprite.
 */
function endsHitTurn(event: ScriptEvent, hidden: Hidden, ctx: Context): boolean {
  if (hidden.pendingAt === ctx.at) return true
  if (event.kind === 'cant') return sameMon(event.who, hidden.who)
  return (
    event.kind === 'damage' &&
    sameMon(event.who, hidden.who) &&
    event.hp.hp > 0 &&
    event.cause !== undefined &&
    toID(event.cause.name) === 'confusion'
  )
}

/** Gen 1's `cant` that keeps the user out of reach, which the stream shows anyway. */
function noteGen1(event: ScriptEvent, { move }: Hidden, ctx: Context): void {
  if (ctx.script.gen !== 1 || event.kind !== 'cant') return
  if (!KEEPS_OUT_OF_REACH_IN_GEN_1.has(toID(event.reason.name))) return
  ctx.note(event.line, mechanicGap(move, 'keeping its user out of reach after it could not move'))
}

/** After each event's handler: shows a hidden Pokémon whose hit turn ended without a hit. */
export function showHidden(event: ScriptEvent, ctx: Context): void {
  for (const side of SIDES) {
    const hidden = ctx.hidden[side]
    if (hidden === undefined) continue
    if (endsHidden(event, hidden)) {
      ctx.hidden[side] = undefined
    } else if (endsHitTurn(event, hidden, ctx)) {
      noteGen1(event, hidden, ctx)
      show(side, event.line, ctx)
    }
  }
}
