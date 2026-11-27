// The server's sequences of a stat stage change and of a stat at its limit (#109), in the order
// pokebw2's src/battle/btl_server_flow.c puts them into the queue. Each line goes out as its base
// label; the game picks the stat's name, the degree and the row from the arguments
// (FormatStatChange, FormatStatLimit in btl_string.c). Pure: every number of the game comes in
// from build/gen5/bw2.json.
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import { GEN5_STAGE } from './effect-names.ts'
import { battleConstant, type EffectScene, message, type Sequences } from './effect-scene.ts'
import type { EventOf } from './rules.ts'

/** ServerDisplay_StatChange: the stage op, the stage's effect and the line, each with the mon ID,
 * the stat and the stages; a raise by the context of none, as a move's own raise. A stat change
 * that an ability or an item names in the log waits for its own sequence. */
function statChange(scene: EffectScene, event: EventOf<'statChange'>): ServerCommand[] | undefined {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || event.cause !== undefined) return undefined
  const args = [who.monId, battleConstant(scene, GEN5_STAGE[event.stat]), Math.abs(event.stages)]
  const [op, effect, line] =
    event.stages > 0
      ? (['SC_OP_RAISE_STAT_STAGE', 'SC_STAT_UP_EFFECT', LINES.statRose] as const)
      : (['SC_OP_LOWER_STAT_STAGE', 'SC_STAT_DOWN_EFFECT', LINES.statFell] as const)
  return [{ command: op, args }, { command: effect, args }, message(scene, line, args)]
}

/** ServerDisplay_StatChangeLimit: the line that the stat will not go higher, or lower, with the
 * mon ID and the stat. */
function statLimit(scene: EffectScene, event: EventOf<'statLimit'>): ServerCommand[] | undefined {
  const who = scene.state.inPlace(event.who)
  if (who === undefined) return undefined
  const line = event.direction === 'up' ? LINES.statWontRise : LINES.statWontFall
  return [message(scene, line, [who.monId, battleConstant(scene, GEN5_STAGE[event.stat])])]
}

/** The stat sequences by the kind of event they write. */
export const STAT_SEQUENCES = { statChange, statLimit } as const satisfies Sequences
