// The server's sequences of an ability with its pop-up (#109, lane plan D11): Intimidate, Iron
// Barbs and Poison Heal, each in the order pokebw2's src/battle/handler/ability_handlers.c and
// src/battle/btl_server_flow.c put it into the queue. Intimidate's pop-up opens at its line and
// closes after the last drop of its run, as HandlerIntimidateMemberIn runs the pop-up's start,
// the stat change and its end; the drop itself is STAT_SEQUENCES' (stats.ts). The writer asks
// these sequences before stats.ts', which writes the same drop without the pop-up. Pure: every
// number of the game comes in from build/gen5/bw2.json.
import type { ScriptEvent } from '../../script/events.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import {
  type EffectScene,
  inPopup,
  message,
  recoverHp,
  type Sequences,
  simpleHp,
} from './effect-scene.ts'
import { causeId, effectId } from './names.ts'
import type { EventOf } from './rules.ts'
import { STAT_SEQUENCES } from './stats.ts'

const isIntimidate = (event: ScriptEvent | undefined): event is EventOf<'ability'> =>
  event?.kind === 'ability' && effectId('ability', event.ability) === 'intimidate'

/** A drop of Intimidate's run: a stat change with no cause of the log on the other side than the
 * holder's. */
const inRun = (holder: EventOf<'ability'>, event: ScriptEvent | undefined) =>
  event?.kind === 'statChange' && event.cause === undefined && event.who.side !== holder.who.side

/** The Intimidate whose run holds the stat change at `at`, if one does. */
function runHolder(events: readonly ScriptEvent[], at: number): EventOf<'ability'> | undefined {
  let start = at
  while (events[start - 1]?.kind === 'statChange') start -= 1
  const holder = events[start - 1]
  const run = isIntimidate(holder) && events.slice(start, at + 1).every((e) => inRun(holder, e))
  return run ? holder : undefined
}

/** Intimidate's line: the pop-up opens, and closes at once when no drop follows. Every other
 * ability's line has no sequence here. */
function ability(scene: EffectScene, event: EventOf<'ability'>): ServerCommand[] | undefined {
  const holder = scene.state.inPlace(event.who)
  if (holder === undefined || !isIntimidate(event)) return undefined
  const open = { command: 'SC_ABILITY_POPUP_IN', args: [holder.monId] }
  if (inRun(event, scene.events[scene.at + 1])) return [open]
  return [open, { command: 'SC_ABILITY_POPUP_OUT', args: [holder.monId] }]
}

/** A drop of Intimidate's run: ServerDisplay_StatChange's commands through
 * BattleHandler_StatChange, then after the run's last drop the holder's pop-up closes. */
function statChange(scene: EffectScene, event: EventOf<'statChange'>) {
  const run = runHolder(scene.events, scene.at)
  const holder = run && scene.state.inPlace(run.who)
  const drop = STAT_SEQUENCES.statChange(scene, event)
  if (run === undefined || holder === undefined || drop === undefined) return undefined
  if (inRun(run, scene.events[scene.at + 1])) return drop
  return [...drop, { command: 'SC_ABILITY_POPUP_OUT', args: [holder.monId] }]
}

/** Iron Barbs (HandlerRoughSkin through BattleHandler_Damage with its pop-up): the holder's pop-up
 * around ServerControl_SimpleDamageCore's HP, gauge and the handler's line for the attacker. */
function ironBarbs(scene: EffectScene, event: EventOf<'damage'>) {
  const who = scene.state.inPlace(event.who)
  const holder = event.source && scene.state.inPlace(event.source)
  if (
    who === undefined ||
    holder === undefined ||
    causeId('ability', event.cause) !== 'ironbarbs'
  ) {
    return undefined
  }
  return inPopup(holder.monId, [
    ...simpleHp(scene, event.who, event.hp, who.monId),
    message(scene, LINES.ironBarbs, [who.monId]),
  ])
}

/** Poison Heal (HandlerPoisonHeal through BattleHandler_RecoverHP with its pop-up): the pop-up
 * around ServerControl_RecoverHPCore's effect, HP and gauge, with no line. */
function poisonHeal(scene: EffectScene, event: EventOf<'heal'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || causeId('ability', event.cause) !== 'poisonheal') return undefined
  return inPopup(who.monId, recoverHp(scene, event.who, event.hp, who))
}

/** The abilities' sequences by the kind of event they write. */
export const ABILITY_SEQUENCES = {
  ability,
  statChange,
  damage: ironBarbs,
  heal: poisonHeal,
} as const satisfies Sequences
