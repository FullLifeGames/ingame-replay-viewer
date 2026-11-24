// The animation turn of a MOVE (#65): the value a move animation reads to choose between its
// scripts (`gAnimMoveTurn`; `choosetwoturnanim` takes the second on an odd turn, `jumpifmoveturn`
// branches on it). The engine tests of rom/gen3/test/replay_anim_turns.c ("Replay: engine: …")
// pin what the pinned expansion passes in each case, and this module is the one place that knows
// them; every MOVE takes its turn from here.
//
// - A move with `flags.charge`: 0 on its charge turn (`-prepare`), 1 on its hit, which is its
//   move line without `[still]` or, in sun, the `-anim` of the same turn.
// - Curse: 1 for the stat raise, 0 for the Ghost's curse. Showdown logs the curse as a start of
//   Curse on the target; the log says which branch ran, also for a Pokémon that Transform or
//   Color Change made a Ghost.
// - Brick Break: 1 when its lines end a screen on its target's side, else 0.
// - Future Sight and Doom Desire (`flags.futuremove`): 1 on the hit.
// - Swallow: the Stockpile count, the last `stockpile<n>` its user started.
// - Every other move, the later hits of a multi-hit move, Bide's unleash and Pursuit on a
//   switching target: 0.
import { Dex, toID } from '@pkmn/dex'

import type { ScriptEvent } from '../../script/events'
import { type Context, type EventOf, sameMon } from './context'

/** The first of a move's animations, which a charge turn plays. */
export const CHARGE_TURN = 0

/** The animation of a two-turn move's hit and of a future attack's hit. */
export const HIT_TURN = 1

const PLAIN_TURN = 0

const STOCKPILE = /^stockpile(\d)$/

const isCharging = (move: string) => Dex.moves.get(move).flags.charge === 1

/** Future Sight and Doom Desire, whose hit comes two turns after the move. */
export const isFutureMove = (move: string) => Dex.moves.get(move).flags.futuremove === 1

type TurnRule = (move: EventOf<'move'>, events: readonly ScriptEvent[], ctx: Context) => number

const startsCurse = (event: ScriptEvent) =>
  event.kind === 'effectStart' && toID(event.effect.name) === 'curse'

function brickBreak(move: EventOf<'move'>, events: readonly ScriptEvent[]): number {
  const side = move.target?.side ?? move.user.side
  const broke = events.some((event) => event.kind === 'sideEnd' && event.side === side)
  return broke ? HIT_TURN : PLAIN_TURN
}

/** The layers of the user's last Stockpile start before the move. */
function stockpiles(move: EventOf<'move'>, _events: readonly ScriptEvent[], ctx: Context): number {
  const before = ctx.script.events.slice(0, ctx.at).toReversed()
  for (const event of before) {
    if (event.kind !== 'effectStart' || !sameMon(event.who, move.user)) continue
    const layers = STOCKPILE.exec(toID(event.effect.name))?.[1]
    if (layers !== undefined) return Number(layers)
  }
  return PLAIN_TURN
}

const BY_MOVE: Readonly<Partial<Record<string, TurnRule>>> = {
  curse: (_move, events) => (events.some(startsCurse) ? PLAIN_TURN : HIT_TURN),
  brickbreak: brickBreak,
  swallow: stockpiles,
}

/**
 * The turn of the MOVE a move line plays, from the move's own lines (`events`, up to the next
 * action). A charging move's line plays only on its hit: its charge turn is `[still]`.
 */
export function animTurnOf(
  move: EventOf<'move'>,
  events: readonly ScriptEvent[],
  ctx: Context,
): number {
  const rule = BY_MOVE[toID(move.move)]
  if (rule !== undefined) return rule(move, events, ctx)
  return isCharging(move.move) ? HIT_TURN : PLAIN_TURN
}

/** The turn of a move's animation alone (`-anim`): Solar Beam's hit in sun. */
export const animTurnOfAnim = ({ move }: EventOf<'anim'>) =>
  isCharging(move) ? HIT_TURN : PLAIN_TURN
