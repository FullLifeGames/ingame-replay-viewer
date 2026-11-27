// The server's sequences of a status condition (#109, lane plan D6): its start by a move or by
// Toxic Orb, its cure, its damage at the turn's end, and the turn it stops a move, each in the
// order pokebw2's src/battle/btl_server_flow.c puts it into the queue. The condition's value keeps
// its type, so the client finds the status again after a switch, and bad poison its mark. Pure:
// every number of the game comes in from build/gen5/bw2.json.
import type { StatusName } from '@pkmn/data'

import type { ServerCommand } from '../server-cmd.ts'
import type { InPlace } from './battle-state.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import { GEN5_STATUS } from './effect-names.ts'
import {
  battleConstant,
  effectNumber,
  type EffectScene,
  message,
  type Sequences,
  simpleHp,
} from './effect-scene.ts'
import type { Gen5Line } from './lines.ts'
import { gen5, gen5Item } from './names.ts'
import type { EventOf } from './rules.ts'

/** The line GetConditionAddMessage picks for each status. */
const ADD_LINES: Readonly<Record<StatusName, Gen5Line>> = {
  brn: LINES.burned,
  par: LINES.paralyzed,
  slp: LINES.fellAsleep,
  frz: LINES.frozen,
  psn: LINES.poisoned,
  tox: LINES.badlyPoisoned,
}

/** The line GetConditionDamageMessage picks for the statuses that hurt at the turn's end. */
const DAMAGE_LINES: Readonly<Partial<Record<StatusName, Gen5Line>>> = {
  psn: LINES.hurtByPoison,
  tox: LINES.hurtByPoison,
  brn: LINES.hurtByBurn,
}

/** The line ServerDisplay_MoveFailMessage puts for a move that a status or a flinch stops. */
const CANT_LINES: Readonly<Partial<Record<string, Gen5Line>>> = {
  slp: LINES.fastAsleep,
  par: LINES.fullyParalyzed,
  frz: LINES.frozenSolid,
  flinch: LINES.flinched,
}

const isStatus = (name: string): name is StatusName => Object.hasOwn(GEN5_STATUS, name)

/** The value SC_OP_SET_CONDITION carries: bad poison's, sleep's at the game's most turns, or a
 * status for good (BtlCalc_MakeStatusCondition, MakeConditionBadlyPoisoned). */
function conditionValue(scene: EffectScene, status: StatusName): number {
  const values = scene.numbers.effects.conditionValues
  if (GEN5_STATUS[status].badly) return values.badlyPoisoned
  return status === 'slp' ? values.sleep : values.permanent
}

/** ServerControl_AddCondition: ServerDisplay_AddCondition's SC_OP_SET_CONDITION and its icon,
 * bad poison's apart, the condition's effect at the Pokémon, then `line`. */
function addCondition(
  scene: EffectScene,
  status: StatusName,
  who: InPlace,
  line: ServerCommand,
): ServerCommand[] {
  const { condition, badly } = GEN5_STATUS[status]
  const number = battleConstant(scene, condition)
  const icon = badly ? scene.numbers.effects.badlyPoisonedGauge : number
  return [
    { command: 'SC_OP_SET_CONDITION', args: [who.monId, number, conditionValue(scene, status)] },
    { command: 'SC_SET_GAUGE_STATUS', args: [who.monId, icon] },
    { command: 'SC_EFFECT_BY_POS', args: [who.pos, effectNumber(scene, 'addEffects', condition)] },
    line,
  ]
}

/** A status by a move, with GetConditionAddMessage's line; by Toxic Orb, with HandlerToxicOrb's
 * line and the item (through BattleHandler_AddCondition). */
function statusCommands(scene: EffectScene, event: EventOf<'status'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined) return undefined
  const { cause } = event
  if (cause === undefined) {
    return addCondition(
      scene,
      event.status,
      who,
      message(scene, ADD_LINES[event.status], [who.monId]),
    )
  }
  if (cause.kind !== 'item' || gen5.items.get(cause.name)?.id !== 'toxicorb') return undefined
  const line = message(scene, LINES.toxicOrb, [who.monId, gen5Item(cause.name)])
  return addCondition(scene, event.status, who, line)
}

/** The line ServerControl_CureStatus puts for a cure the log says: woke up, thawed, or back to
 * normal. */
const cureLine = (status: StatusName): Gen5Line =>
  status === 'slp' ? LINES.wokeUp : status === 'frz' ? LINES.thawed : LINES.statusCured

/** A cure: SC_OP_CURE_CONDITION and the icon cleared to CONDITION_NONE, which
 * ServerControl_CureStatus and ServerControl_CureCondition write as a literal (the generator holds
 * both to the name), for a Pokémon in place. In silence, as Natural Cure's through
 * BattleHandler_CureCondition and ServerControl_CureCondition, the two alone; with the status's
 * own line, ServerControl_CureStatus's line after them. */
function cureCommands(scene: EffectScene, event: EventOf<'cureStatus'>) {
  const who = scene.state.inPlace(event.who)
  if (who === undefined || (event.silent !== true && event.msg !== true)) return undefined
  const ops: ServerCommand[] = [
    { command: 'SC_OP_CURE_CONDITION', args: [who.monId] },
    { command: 'SC_SET_GAUGE_STATUS', args: [who.monId, battleConstant(scene, 'CONDITION_NONE')] },
  ]
  return event.silent === true ? ops : [...ops, message(scene, cureLine(event.status), [who.monId])]
}

/** ServerControl_ConditionDamage for poison and a burn: the condition's effect at the Pokémon,
 * then ServerControl_SimpleDamageCore's HP, gauge and GetConditionDamageMessage's line. */
function statusDamage(scene: EffectScene, event: EventOf<'damage'>) {
  const name = event.cause?.kind === undefined ? event.cause?.name : undefined
  if (name === undefined || !isStatus(name)) return undefined
  const line = DAMAGE_LINES[name]
  const who = scene.state.inPlace(event.who)
  if (line === undefined || who === undefined) return undefined
  const effect = effectNumber(scene, 'damageEffects', GEN5_STATUS[name].condition)
  return [
    { command: 'SC_EFFECT_BY_POS', args: [who.pos, effect] },
    ...simpleHp(scene, event.who, event.hp, who.monId),
    message(scene, line, [who.monId]),
  ]
}

/** ServerControl_MoveFail: ServerDisplay_MoveFailMessage's line, then for sleep, paralysis and
 * freeze the condition's effect at the Pokémon, the one ServerControl_AddCondition plays. */
function cantCommands(scene: EffectScene, event: EventOf<'cant'>) {
  const { name } = event.reason
  const line = CANT_LINES[name]
  const who = scene.state.inPlace(event.who)
  if (line === undefined || who === undefined) return undefined
  const said = message(scene, line, [who.monId])
  if (!isStatus(name)) return [said]
  const effect = effectNumber(scene, 'addEffects', GEN5_STATUS[name].condition)
  return [said, { command: 'SC_EFFECT_BY_POS', args: [who.pos, effect] }]
}

/** The status sequences by the kind of event they write. */
export const STATUS_SEQUENCES = {
  status: statusCommands,
  cureStatus: cureCommands,
  damage: statusDamage,
  cant: cantCommands,
} as const satisfies Sequences
