// The server's sequences of a Substitute (#109, lane plan D10): its start, a hit on it, and its
// end when a hit breaks it, each in the order pokebw2's src/battle/btl_server_flow.c puts it into
// the queue. The log puts the start before its HP drop, the game the drop first
// (ServerControl_Substitute): the start writes the whole sequence with the drop's HP, and the
// drop's line shows in the start's block (`substituteShows`, which the writer puts beside the
// block's lines). Pure: every number of the game comes in from build/gen5/bw2.json.
import type { ScriptEvent } from '../../script/events.ts'
import { scaleHp } from '../../script/hp-scale.ts'
import type { Effect, PokemonRef } from '../../script/types.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { InPlace } from './battle-state.ts'
import { GEN5_EFFECT_LINES as LINES } from './effect-lines.ts'
import { GEN5_EFFECTIVENESS } from './effect-names.ts'
import {
  battleConstant,
  type EffectScene,
  message,
  type Sequences,
  simpleHp,
} from './effect-scene.ts'
import { hitLines } from './hits.ts'
import { gen5, gen5Move } from './names.ts'
import type { EventOf } from './rules.ts'
import { refKey } from './slots.ts'

const isSubstitute = (effect: Effect) => gen5.moves.get(effect.name)?.id === 'substitute'

/** The HP drop of the Substitute's start at `at`: the next event, a damage of its holder with no
 * cause. */
function startDrop(events: readonly ScriptEvent[], at: number): EventOf<'damage'> | undefined {
  const start = events[at]
  const drop = events[at + 1]
  if (start?.kind !== 'effectStart' || start.silent === true || !isSubstitute(start.effect)) {
    return undefined
  }
  const own = drop?.kind === 'damage' && drop.cause === undefined
  return own && refKey(drop.who) === refKey(start.who) ? drop : undefined
}

/** The log lines a Substitute's start at `at` shows besides its own: its HP drop's. */
export function substituteShows(events: readonly ScriptEvent[], at: number): number[] {
  const drop = startDrop(events, at)
  return drop === undefined ? [] : [drop.line]
}

/** ServerControl_Substitute: the HP drop with its gauge (ServerDisplay_SimpleHP), the doll's HP
 * as the cost (SC_OP_CREATE_SUBSTITUTE), the doll at the position, and the line. */
function start(scene: EffectScene, event: EventOf<'effectStart'>): ServerCommand[] | undefined {
  const drop = startDrop(scene.events, scene.at)
  const who = scene.state.inPlace(event.who)
  if (drop === undefined || who === undefined) return undefined
  const cost = scene.state.hpOf(event.who) - scaleHp(drop.hp)
  if (cost <= 0) return undefined
  return [
    ...simpleHp(scene, event.who, drop.hp, who.monId),
    { command: 'SC_OP_CREATE_SUBSTITUTE', args: [who.monId, cost] },
    { command: 'SC_SUBSTITUTE_CREATE', args: [who.pos] },
    message(scene, LINES.substitute, [who.monId]),
  ]
}

/** The move of the action that hits the holder `who`: its last move before the event, by another
 * Pokémon, on `who`. */
function hitBy(scene: EffectScene, who: PokemonRef): EventOf<'move'> | undefined {
  const move = scene.action.slice(0, scene.index).findLast((event) => event.kind === 'move')
  if (move?.kind !== 'move' || move.target === undefined) return undefined
  const onHolder = refKey(move.target) === refKey(who) && refKey(move.user) !== refKey(who)
  return onHolder ? move : undefined
}

/** ServerControl_DamageSubstitute: SC_DAMAGE_EFFECT with the holder, the type effectiveness and
 * the move, the doll's line, then the effectiveness and critical hit's lines. */
function hit(
  scene: EffectScene,
  event: EventOf<'effectActivate' | 'effectEnd'>,
  who: InPlace,
  move: EventOf<'move'>,
): ServerCommand[] {
  const effectiveness = battleConstant(scene, GEN5_EFFECTIVENESS[event.effectiveness ?? 'plain'])
  return [
    { command: 'SC_DAMAGE_EFFECT', args: [who.monId, effectiveness, gen5Move(move.move)] },
    message(scene, LINES.substituteHit, [who.monId]),
    ...hitLines(scene.numbers.text, event),
  ]
}

/** The holder in place and the move that hits it, for a Substitute's hit or end. */
function hitScene(scene: EffectScene, event: EventOf<'effectActivate' | 'effectEnd'>) {
  const who = event.who && scene.state.inPlace(event.who)
  const move = event.who && hitBy(scene, event.who)
  return isSubstitute(event.effect) && who && move ? { who, move } : undefined
}

/** The Substitute's sequences by the kind of event they write:
 * - a hit that leaves the doll standing (`[damage]`): ServerControl_DamageSubstitute's hit;
 * - its end after a hit: the hit, then ServerControl_BreakSubstitute's faded line,
 *   SC_OP_DELETE_SUBSTITUTE and the doll gone from the position. */
export const SUBSTITUTE_SEQUENCES = {
  effectStart: start,
  effectActivate: (scene, event) => {
    const struck = event.damage === true ? hitScene(scene, event) : undefined
    return struck && hit(scene, event, struck.who, struck.move)
  },
  effectEnd: (scene, event) => {
    const struck = event.silent === true ? undefined : hitScene(scene, event)
    if (struck === undefined) return undefined
    const { who, move } = struck
    return [
      ...hit(scene, event, who, move),
      message(scene, LINES.substituteFaded, [who.monId]),
      { command: 'SC_OP_DELETE_SUBSTITUTE', args: [who.monId] },
      { command: 'SC_SUBSTITUTE_DELETE', args: [who.pos] },
    ]
  },
} as const satisfies Sequences
