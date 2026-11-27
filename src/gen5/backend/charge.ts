// A charged move that fires in the turn it charges (#110, lane plan D6): Solar Beam in sun. The
// simulator logs its move line [still], then -prepare and -anim of the same move, then the hit.
// pokebw2's src/battle/btl_server_flow.c puts the move line (ServerDisplay_MoveMessage), and
// ServerControl_CheckChargeTurn, with the skip flag that HandlerSolarBeamSunCheck sets, runs
// ServerControl_StartChargeTurn: the charge's line by its handler (HandlerSolarBeamCharge), then
// SC_MOVE_ANIM with the plain look. The release then sets the look's index, which
// ServerControl_PutMoveAnimation sends, before the hit. A charge turn the move spends, and a move
// with no generated charge line, wait as unplayed. Pure: every number of the game comes in from
// build/gen5/bw2.json.
import type { ScriptEvent } from '../../script/events.ts'
import type { PokemonRef } from '../../script/types.ts'
import type { FlowNumbers } from '../bw2-flow-numbers.ts'
import type { TextNumbers } from '../bw2-numbers.ts'
import { PLAIN_TURN } from '../moment.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { Action } from './blocks.ts'
import { GEN5_EFFECT_LINES } from './effect-lines.ts'
import type { PlayedMove } from './hits.ts'
import { type Gen5Line, lineId } from './lines.ts'
import { effectId } from './names.ts'
import type { EventOf } from './rules.ts'

/** The line each move's handler puts as its charge starts, by the move's ID: the moves whose
 * charge skip plays. */
const CHARGE_LINES: Readonly<Partial<Record<string, Gen5Line>>> = {
  solarbeam: GEN5_EFFECT_LINES.absorbedLight,
}

/** A charge skip: the target that the release names (`-anim`), and the charge's line. */
export interface ChargeSkip {
  readonly target: PokemonRef | undefined
  readonly line: Gen5Line
}

const sameRef = (a: PokemonRef, b: PokemonRef) => a.side === b.side && a.index === b.index

/** Whether `event` is a -prepare or -anim of `move`'s move by its user. */
const ofMove = (event: ScriptEvent, move: EventOf<'move'>) =>
  (event.kind === 'prepare' || event.kind === 'anim') &&
  event.move === move.move &&
  sameRef(event.user, move.user)

/** Whether `event` is the release of `move`: its -anim, which neither misses nor lacks a target. */
function isRelease(
  event: ScriptEvent | undefined,
  move: EventOf<'move'>,
): event is EventOf<'anim'> {
  return (
    event?.kind === 'anim' && event.miss !== true && event.notarget !== true && ofMove(event, move)
  )
}

/** The charge skip `action` opens with: a [still] move, its -prepare, then its release, of a move
 * with a charge line. Undefined for any other action. */
export function chargeSkipOf(action: Action): ChargeSkip | undefined {
  const [move, prepare, anim] = action
  if (move?.kind !== 'move' || move.still !== true) return undefined
  if (prepare?.kind !== 'prepare' || !ofMove(prepare, move) || !isRelease(anim, move)) {
    return undefined
  }
  const line = CHARGE_LINES[effectId('move', move.move) ?? '']
  return line && { target: anim.target, line }
}

/** What the charge's commands take: the lines and the flow's numbers. */
interface ChargeScene {
  readonly numbers: { readonly text: TextNumbers; readonly flow: FlowNumbers }
}

/** The commands of a charge skip's -prepare (the charge's line with the user's mon ID, and the
 * plain look) or -anim (the release's look); undefined for every other event. */
export function chargeCommands(
  scene: ChargeScene,
  event: ScriptEvent,
  move: PlayedMove,
  skip: ChargeSkip,
): ServerCommand[] | undefined {
  const look = (index: number): ServerCommand => ({
    command: 'SC_MOVE_ANIM',
    args: [move.user.pos, move.target.pos, move.move, index],
  })
  if (event.kind === 'anim') return [look(scene.numbers.flow.chargeRelease)]
  if (event.kind !== 'prepare') return undefined
  const message = lineId(scene.numbers.text, skip.line)
  return [{ command: 'SC_MSG_SET', message, args: [move.user.monId] }, look(PLAIN_TURN)]
}
