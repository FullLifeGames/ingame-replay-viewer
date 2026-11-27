// The server's sequences of a move's hit, miss, failure and immunity and of a heal by Leftovers
// (#107), each in the order pokebw2's src/battle/btl_server_flow.c puts it into the queue, and
// the silent bar of an HP change that does not play yet (lane plan D1, D6). Each line comes from
// the text banks by its label (lines.ts). Pure: every number of the game comes in from
// build/gen5/bw2.json.
import type { Hit, ScriptEvent } from '../../script/events.ts'
import type { HpFraction, PokemonRef } from '../../script/types.ts'
import type { FlowNumbers, TextNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { BattleState, InPlace } from './battle-state.ts'
import { type Gen5Line, GEN5_LINES, lineId } from './lines.ts'
import { gen5Item } from './names.ts'
import { type EventOf, isLeftovers } from './rules.ts'

/** A move that plays: its user and its target in place, and its number. */
export interface PlayedMove {
  readonly user: InPlace
  readonly target: InPlace
  readonly targetRef: PokemonRef
  readonly move: number
}

/** What the sequences take: the battle state, the lines and the flow's numbers, and the move of
 * the action when it plays. */
export interface HitScene {
  readonly state: BattleState
  readonly numbers: { readonly text: TextNumbers; readonly flow: FlowNumbers }
  readonly move: PlayedMove | undefined
}

// Two refs to one Pokémon. Its shared home would be src/script/, which #107 leaves as it is.
const sameRef = (a: PokemonRef, b: PokemonRef | undefined) =>
  a.side === b?.side && a.index === b.index

const std = (text: TextNumbers, line: Gen5Line): ServerCommand => ({
  command: 'SC_MSG_STD',
  message: lineId(text, line),
  args: [],
})

const set = (scene: HitScene, line: Gen5Line, args: number[]): ServerCommand => ({
  command: 'SC_MSG_SET',
  message: lineId(scene.numbers.text, line),
  args,
})

/** The game's HP change of `who` to `hp`, if it changes. */
function hpOp(scene: HitScene, who: PokemonRef, hp: HpFraction): ServerCommand[] {
  const op = scene.state.hpTo(who, hp)
  return op === undefined ? [] : [op]
}

/** ServerControl_DamageListCore through ServerDisplay_Damage: the HP drop
 * (ServerDisplay_DecreaseHP), then SC_DAMAGE_PLURAL with the effectiveness kind, which picks the
 * hit sound, and the target's mon ID as a byte (BtlServerCmdQueue_PutByte); then the
 * effectiveness line (ServerDisplay_EffectivenessMessageMulti) and the critical hit's line
 * (ServerDisplay_CriticalHitMessage). */
function hit(scene: HitScene, event: EventOf<'damage'>, move: PlayedMove): ServerCommand[] {
  const { damageKinds } = scene.numbers.flow
  const kind = event.effectiveness ?? 'plain'
  const flash: ServerCommand = {
    command: 'SC_DAMAGE_PLURAL',
    args: [1, damageKinds[kind], move.move],
    bytes: [move.target.monId],
  }
  return [...hpOp(scene, event.who, event.hp), flash, ...hitLines(scene.numbers.text, event)]
}

/** The lines after a hit on one target: the effectiveness line
 * (ServerDisplay_EffectivenessMessageMulti), then the critical hit's line
 * (ServerDisplay_CriticalHitMessage); a hit on a Substitute shows them too. */
export function hitLines(text: TextNumbers, hit: Hit): ServerCommand[] {
  const { effectiveness } = hit
  const effective =
    effectiveness === undefined
      ? []
      : [std(text, GEN5_LINES[effectiveness === 'super' ? 'superEffective' : 'notVeryEffective'])]
  return [...effective, ...(hit.crit === true ? [std(text, GEN5_LINES.critical)] : [])]
}

/** ServerControl_UseHeldItem reserves SC_USE_HELD_ITEM; HandlerLeftoversUse asks for the heal,
 * ServerControl_RecoverHPCore shows its effect at the Pokémon's position and moves the bar
 * (ServerDisplay_SimpleHP), and the handler's set line follows. */
function leftovers(scene: HitScene, event: EventOf<'heal'>, who: InPlace): ServerCommand[] {
  return [
    { command: 'SC_USE_HELD_ITEM', args: [who.monId] },
    { command: 'SC_EFFECT_BY_POS', args: [who.pos, scene.numbers.flow.recoverEffect] },
    ...hpOp(scene, event.who, event.hp),
    { command: 'SC_UPDATE_HP_GAUGE', args: [who.monId] },
    set(scene, GEN5_LINES.leftovers, [who.monId, gen5Item('Leftovers')]),
  ]
}

/** A sequence of an event that plays, or undefined where it has none. */
type Sequence<K extends ScriptEvent['kind']> = (
  scene: HitScene,
  event: EventOf<K>,
) => ServerCommand[] | undefined

/** The sequences of the kinds that play (rules.ts): each event of a move but the heal needs the
 * move to play, and the hit, miss and immunity its target. */
const SEQUENCES: { readonly [K in 'damage' | 'miss' | 'immune' | 'fail' | 'heal']: Sequence<K> } = {
  damage: (scene, event) => {
    const { move } = scene
    return move && sameRef(event.who, move.targetRef) ? hit(scene, event, move) : undefined
  },
  // ServerDisplay_MoveAvoided names the Pokémon that avoided the move.
  miss: (scene, event) => {
    const { move } = scene
    return move && sameRef(move.targetRef, event.target)
      ? [set(scene, GEN5_LINES.avoided, [move.target.monId])]
      : undefined
  },
  // ServerDisplay_DoesntAffect names the Pokémon the move does not affect.
  immune: (scene, event) => {
    const { move } = scene
    return move && sameRef(event.who, move.targetRef)
      ? [set(scene, GEN5_LINES.doesNotAffect, [move.target.monId])]
      : undefined
  },
  // ServerDisplay_MoveFailed.
  fail: (scene) => scene.move && [std(scene.numbers.text, GEN5_LINES.failed)],
  heal: (scene, event) => {
    const who = scene.state.inPlace(event.who)
    return who && isLeftovers(event.cause) ? leftovers(scene, event, who) : undefined
  },
}

/** The commands of an event that plays, with every Pokémon it names in place; undefined where
 * the event has no sequence here: a hit on another Pokémon than the move's target, or a miss,
 * failure or immunity outside a move that plays. */
export function hitCommands(scene: HitScene, event: ScriptEvent): ServerCommand[] | undefined {
  const sequences = SEQUENCES as Partial<Record<string, Sequence<ScriptEvent['kind']>>>
  return sequences[event.kind]?.(scene, event)
}

/** ServerDisplay_SimpleHP: the bar of an HP change of a Pokémon in place that does not play yet
 * moves with no line, so the game's HP follows the log's (D6). */
export function silentBar(scene: HitScene, event: ScriptEvent): ServerCommand[] {
  if (event.kind !== 'damage' && event.kind !== 'heal' && event.kind !== 'setHp') return []
  const who = scene.state.inPlace(event.who)
  if (who === undefined) return []
  const op = hpOp(scene, event.who, event.hp)
  return op.length === 0 ? [] : [...op, { command: 'SC_UPDATE_HP_GAUGE', args: [who.monId] }]
}
