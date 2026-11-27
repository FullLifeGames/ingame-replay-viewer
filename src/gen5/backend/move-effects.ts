// The server's sequences of the moves' own effects (#109, lane plan D8): Protect's line and the
// line of a move it blocks, Focus Punch's focus, and a drain's heal, each in the order pokebw2's
// src/battle/handler/move_handlers.c and src/battle/btl_server_flow.c put it into the queue.
// HandlerProtect also sets a turn flag and its counter, and HandlerFocuspunch a turn flag; the
// client's view never reads them, so the sequences leave them out. Pure: every number of the game
// comes in from build/gen5/bw2.json.
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import { type EffectScene, message, recoverHp, type Sequences } from './effect-scene.ts'
import { effectId } from './names.ts'
import type { EventOf } from './rules.ts'

/** The effect that lasts the turn:
 * - Protect (HandlerProtect through BattleHandler_Message): its line;
 * - Focus Punch (HandlerFocuspunch): BattleHandler_EffectAtPos hides the message window and plays
 *   the focus effect at the user's position, then the handler's line. The window's argument is
 *   the literal ServerControl_TurnCheck puts too, and the handler names no second position. */
function singleTurn(scene: EffectScene, event: EventOf<'singleTurn'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined) return undefined
  const id = effectId('move', event.effect.name)
  if (id === 'protect') return [message(scene, LINES.protected, [who.monId])]
  if (id !== 'focuspunch') return undefined
  const { hideWindow, focusEffect } = scene.numbers.effects
  return [
    { command: 'SC_HIDE_MSG_WINDOW', args: [hideWindow] },
    { command: 'SC_EFFECT_BY_POS', args: [who.pos, focusEffect] },
    message(scene, LINES.focusing, [who.monId]),
  ]
}

/** ServerControl_RemoveNoEffectTargets: the line of a Pokémon whose protection blocks the move. */
function block(scene: EffectScene, event: EventOf<'block'>): ServerCommand[] | undefined {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || effectId('move', event.effect.name) !== 'protect') return undefined
  return [message(scene, LINES.protectBlocked, [who.monId])]
}

/** ServerControl_DamageDrain: ServerControl_RecoverHPCore's effect, HP and gauge through
 * ServerControl_DrainCore, then the line that names the Pokémon drained (`[of]`). */
function drain(scene: EffectScene, event: EventOf<'heal'>) {
  const who = scene.state.inPlace(event.who)
  const drained = event.source && scene.state.inPlace(event.source)
  const drains = event.cause?.kind === undefined && event.cause?.name === 'drain'
  if (who === undefined || drained === undefined || !drains) return undefined
  return [
    ...recoverHp(scene, event.who, event.hp, who),
    message(scene, LINES.drained, [drained.monId]),
  ]
}

/** The moves' own effects by the kind of event they write. */
export const MOVE_EFFECT_SEQUENCES = {
  singleTurn,
  block,
  heal: drain,
} as const satisfies Sequences
