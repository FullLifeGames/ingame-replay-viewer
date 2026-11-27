// What the sequences of a battle's effects take (#109): the battle state, the numbers, and where
// the event stands. Each sequence is a function of the scene and one event that gives the commands
// pokebw2's server puts for it, or undefined where it has none; status.ts, stats.ts, field.ts,
// items.ts, abilities.ts, substitute.ts and move-effects.ts hold them by kind. The turn's end runs
// as one action per event (blocks.ts), so a sequence that looks at the events beside it reads the
// script's events. Pure: every number of the game comes in from build/gen5/bw2.json.
import type { ScriptEvent } from '../../script/events.ts'
import type { HpFraction, PokemonRef } from '../../script/types.ts'
import type { EffectNumbers, FlowNumbers } from '../bw2-flow-numbers.ts'
import type { BattleNumbers, PkmNumbers, TextNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { BattleState, InPlace } from './battle-state.ts'
import type { Action } from './blocks.ts'
import { type Gen5Line, lineId } from './lines.ts'
import type { EventOf } from './rules.ts'

/** The numbers the effects' sequences take. */
interface EffectSceneNumbers {
  readonly text: TextNumbers
  readonly flow: FlowNumbers
  readonly effects: EffectNumbers
  readonly battle: Pick<BattleNumbers, 'constants' | 'single'>
  readonly pkm: Pick<PkmNumbers, 'items'>
}

/** The battle state, the numbers, the event's action and its index there, and the script's
 * events with the event's index among them. */
export interface EffectScene {
  readonly state: Pick<BattleState, 'inPlace' | 'placed' | 'hpOf' | 'hpTo'>
  readonly numbers: EffectSceneNumbers
  readonly action: Action
  readonly index: number
  readonly events: readonly ScriptEvent[]
  readonly at: number
}

/** The sequence of one kind of event: the commands, or undefined where it has none. */
type Sequence<K extends ScriptEvent['kind']> = (
  scene: EffectScene,
  event: EventOf<K>,
) => ServerCommand[] | undefined

/** Sequences by the kind of event they write. */
export type Sequences = { readonly [K in ScriptEvent['kind']]?: Sequence<K> }

/** The commands `sequences` give `event`, or undefined where they have no sequence for it. */
export function sequenceCommands(
  sequences: Sequences,
  scene: EffectScene,
  event: ScriptEvent,
): ServerCommand[] | undefined {
  const byKind = sequences as Partial<Record<string, Sequence<ScriptEvent['kind']>>>
  return byKind[event.kind]?.(scene, event)
}

/** The battle's constant `name` (include/constants/battle.h); throws by name where bw2.json lacks
 * it. */
export function battleConstant(scene: EffectScene, name: string): number {
  const value = scene.numbers.battle.constants[name]
  if (value === undefined) throw new Error(`bw2.json has no ${name}`)
  return value
}

/** The number `key` of the effects' table `table`; throws by name where bw2.json lacks it. */
export function effectNumber(
  scene: EffectScene,
  table: 'addEffects' | 'damageEffects',
  key: string,
): number {
  const value = scene.numbers.effects[table][key]
  if (value === undefined) throw new Error(`bw2.json has no effects.${table}.${key}`)
  return value
}

/** SC_MSG_SET with the line and its arguments, or SC_MSG_STD for a line of the standard bank. */
export function message(scene: EffectScene, line: Gen5Line, args: number[]): ServerCommand {
  const command = line.bank === 'set' ? 'SC_MSG_SET' : 'SC_MSG_STD'
  return { command, message: lineId(scene.numbers.text, line), args }
}

/** ServerDisplay_SimpleHP with its gauge: the game's HP of `who` to `hp`, and SC_UPDATE_HP_GAUGE,
 * which the server puts for a Pokémon in place. */
export function simpleHp(
  scene: EffectScene,
  who: PokemonRef,
  hp: HpFraction,
  monId: number,
): ServerCommand[] {
  const op = scene.state.hpTo(who, hp)
  return [...(op === undefined ? [] : [op]), { command: 'SC_UPDATE_HP_GAUGE', args: [monId] }]
}

/** ServerControl_RecoverHPCore: the heal's effect at the Pokémon's position, then
 * ServerDisplay_SimpleHP with its gauge. */
export function recoverHp(
  scene: EffectScene,
  who: PokemonRef,
  hp: HpFraction,
  place: InPlace,
): ServerCommand[] {
  return [
    { command: 'SC_EFFECT_BY_POS', args: [place.pos, scene.numbers.flow.recoverEffect] },
    ...simpleHp(scene, who, hp, place.monId),
  ]
}

/** `commands` inside the ability pop-up of the Pokémon `monId` (ServerDisplay_AbilityPopupAdd,
 * ServerDisplay_AbilityPopupRemove). */
export const inPopup = (monId: number, commands: readonly ServerCommand[]): ServerCommand[] => [
  { command: 'SC_ABILITY_POPUP_IN', args: [monId] },
  ...commands,
  { command: 'SC_ABILITY_POPUP_OUT', args: [monId] },
]
