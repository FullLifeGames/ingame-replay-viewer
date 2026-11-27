// The server's sequences of a switch, a drag and a send-in (#108, lane plan D2, D3, D4, D6, D7),
// each in the order pokebw2's src/battle/btl_server_flow.c puts it into the queue. The sequence
// calls the battle state's `sendIn` itself, so the party swaps once (battle-state.ts). The game
// picks the recall and send-out lines itself (BattleClient_GetRecallMsg, BattleClient_ScSendOut
// in btl_client.c), so no message ID goes out for either. The switch-in effects that
// ServerControl_AfterSwitchIn runs wait for #109. Pure: every number of the game comes in from
// build/gen5/bw2.json.
import type { Effect } from '../../script/types.ts'
import type { FlowNumbers } from '../bw2-flow-numbers.ts'
import type { TextNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { BattleState, SendIn } from './battle-state.ts'
import { type Gen5Fallback, plainFallback } from './fallbacks.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import { gen5 } from './names.ts'
import { FRONT_SLOT } from './party-state.ts'
import type { EventOf } from './rules.ts'

/** C's TRUE as ServerControl_SwitchInFillSlot's flag: SC_SEND_OUT shows the send-out line. */
export const SHOW_LINE = 1
/** C's FALSE as that flag: SC_SEND_OUT of a drag leaves the line out. */
export const NO_LINE = 0

/** What the sequences take: the battle state, the lines and the flow's numbers, the number of
 * the turn the log began last, the log's last move before the switch-in, and the fallbacks. */
export interface SwitchScene {
  readonly state: BattleState
  readonly numbers: { readonly text: TextNumbers; readonly flow: FlowNumbers }
  readonly turn: number
  readonly lastMove: EventOf<'move'> | undefined
  readonly fallbacks: Gen5Fallback[]
}

type SwitchIn = EventOf<'switchIn'>
type Out = NonNullable<SendIn['out']>

/** Roar and Whirlwind: the status moves that @pkmn's Gen 5 data marks as forcing a switch, which
 * reach ServerControl_ForceSwitchCore through ServerControl_ForceSwitch and its effect. Dragon
 * Tail, Circle Throw and Red Card pass effects of their own (lane plan D4). */
function dragsAsRoar(move: EventOf<'move'> | undefined): boolean {
  const data = move && gen5.moves.get(move.move)
  return data?.forceSwitch === true && data.category === 'Status'
}

/** Baton Pass: the move that @pkmn's Gen 5 data marks as passing its user's stat stages and
 * effects to the Pokémon it switches in (`selfSwitch: 'copyvolatile'`). */
const passesStages = (cause: Effect | undefined): cause is Effect =>
  cause !== undefined && gen5.moves.get(cause.name)?.selfSwitch === 'copyvolatile'

/** ServerControl_SwitchOutCore: SC_RECALL at the Pokémon's position with the caller's effect,
 * then SC_OP_CLEAR_FOR_SWITCH. */
const switchOutCore = (out: Out, effect: number): ServerCommand[] => [
  { command: 'SC_RECALL', args: [out.pos, effect] },
  { command: 'SC_OP_CLEAR_FOR_SWITCH', args: [out.monId] },
]

/** ServerControl_SwitchInFillSlot: ServerControl_SwitchInCore's SC_OP_SETUP_ILLUSION and
 * SC_OP_SEND_IN with the log's turn (D7), then SC_SEND_OUT with the line shown or not. Before
 * them the game's HP of the incoming Pokémon follows the log's when they differ (D6); the box
 * draws at the send-out, so no gauge follows the op. */
function sendInCommands(
  scene: SwitchScene,
  event: SwitchIn,
  sent: SendIn,
  show: number,
): ServerCommand[] {
  const op = scene.state.hpTo(event.who, event.hp)
  const { client, slot } = sent
  return [
    ...(op === undefined ? [] : [op]),
    { command: 'SC_OP_SETUP_ILLUSION', args: [client] },
    { command: 'SC_OP_SEND_IN', args: [client, FRONT_SLOT, slot, scene.turn] },
    { command: 'SC_SEND_OUT', args: [client, FRONT_SLOT, slot, show] },
  ]
}

/** ServerControl_ForceSwitchCore: the recall with ServerControl_ForceSwitch's effect, the
 * send-in without its line, then the drag's line naming the Pokémon dragged out. Every drag
 * plays with Roar's effect; one after another move is listed (D4). */
function drag(scene: SwitchScene, event: SwitchIn, sent: SendIn, out: Out): ServerCommand[] {
  const { lastMove } = scene
  if (!dragsAsRoar(lastMove)) {
    const after = lastMove === undefined ? '' : ` after ${lastMove.move}`
    scene.fallbacks.push(plainFallback(event, `the look of the drag${after}`))
  }
  const commands = [
    ...switchOutCore(out, scene.numbers.flow.switchEffects.drag),
    ...sendInCommands(scene, event, sent, NO_LINE),
  ]
  const { monId } = scene.state.placed(event.who, event.line)
  const line = lineId(scene.numbers.text, GEN5_LINES.draggedOut)
  return [...commands, { command: 'SC_MSG_SET', message: line, args: [monId] }]
}

/**
 * The commands of a switch-in after the leads:
 * - after a faint (BtlServerFlow_RunFaintSwitch): the send-in alone, with its line;
 * - a drag: `drag`;
 * - a switch by choice (ServerControl_ChangePokemon), after U-turn or Volt Switch
 *   (BattleHandler_Switch, played as a plain switch, D2) or by Baton Pass (D3, its stat stages
 *   listed): ServerDisplay_RecallMessage's SC_RECALL_MSG, ServerControl_SwitchOutCore with
 *   ServerControl_SwitchOut's effect, then the send-in with its line.
 * Throws by name where the game's party cannot follow the log (party-state.ts).
 */
export function switchCommands(scene: SwitchScene, event: SwitchIn): ServerCommand[] {
  const sent = scene.state.sendIn(event)
  const { out } = sent
  if (out === undefined) return sendInCommands(scene, event, sent, SHOW_LINE)
  if (event.dragged) return drag(scene, event, sent, out)
  if (passesStages(event.cause)) {
    scene.fallbacks.push(plainFallback(event, `the stat stages ${event.cause.name} carries`))
  }
  return [
    { command: 'SC_RECALL_MSG', args: [sent.client, out.monId] },
    ...switchOutCore(out, scene.numbers.flow.switchEffects.switchOut),
    ...sendInCommands(scene, event, sent, SHOW_LINE),
  ]
}
