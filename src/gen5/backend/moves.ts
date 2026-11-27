// What each action of a battle script writes into Black 2's battle (#107, #108, lane plans D5,
// D6, D11 and D1): a move sends its line and its animation, as ServerControl_Fight and
// ServerControl_ExecuteMove do, and each event after it plays by its rule (hits.ts). A switch-in
// after the leads plays its switch, drag or send-in (switches.ts) and moves the places; each faint
// plays the server's faint (faints.ts) and takes its Pokémon's HP to 0, and the end of Illusion's
// disguise keeps the game's Pokémon in place (battle-state.ts). Each effect plays by the module
// that copies its server function (effects.ts, #109), and the turn's end opens with the hidden
// message window. An event that plays and names a Pokémon not in place fails by name. An action
// with a called move, several hits, a charge turn or a look of its own waits whole. Pure: every
// number of the game comes in from build/gen5/bw2.json.
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { PokemonRef } from '../../script/types.ts'
import type { EffectNumbers, FlowNumbers } from '../bw2-flow-numbers.ts'
import type { BattleNumbers, PkmNumbers, TextNumbers } from '../bw2-numbers.ts'
import { PLAIN_TURN } from '../moment.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { battleState, type BattleState } from './battle-state.ts'
import { type Action, actionsOf, residualOf, type Written } from './blocks.ts'
import { effectCommands } from './effects.ts'
import { faintCommands } from './faints.ts'
import { type Gen5Fallback, laterFallback } from './fallbacks.ts'
import { hitCommands, type PlayedMove, silentBar } from './hits.ts'
import { gen5, gen5Move } from './names.ts'
import { type EventOf, LATER_ISSUES, type Outcome, outcomesOf } from './rules.ts'
import { substituteShows } from './substitute.ts'
import { switchCommands } from './switches.ts'

/** The numbers the writer takes. */
export interface WriteNumbers {
  readonly text: TextNumbers
  readonly flow: FlowNumbers
  readonly effects: EffectNumbers
  readonly battle: Pick<BattleNumbers, 'single' | 'monIds' | 'constants'>
  readonly pkm: Pick<PkmNumbers, 'items'>
}

/** Each side's party in the game's order, by mon ID, after the event of log line `line`. */
export interface PartyOrders {
  readonly line: number
  readonly near: readonly number[]
  readonly far: readonly number[]
}

/** What a script writes: each action's commands by event, a fallback for each event whose rule
 * plays it but which does not play here, and the party orders after each event in replay order,
 * which a run compares with the game's (#108). */
export interface ScriptWrite {
  readonly actions: Written[][]
  readonly fallbacks: Gen5Fallback[]
  readonly orders: PartyOrders[]
}

const { whole: WHOLE } = LATER_ISSUES

/** What the writer carries through the script: the turn the log began last, its last move, and
 * whether the turn's end has hidden the message window follow the events (`follow`). */
interface Scene {
  readonly state: BattleState
  readonly numbers: WriteNumbers
  readonly script: Pick<BattleScript, 'events'>
  readonly outcomes: ReadonlyMap<ScriptEvent, Outcome | undefined>
  readonly residual: (line: number) => boolean
  readonly fallbacks: Gen5Fallback[]
  turn: number
  lastMove: EventOf<'move'> | undefined
  hidden: boolean
}

/** The Pokémon an event of a kind that plays names: a move's or a miss's user and target,
 * every other kind's `who`, and a side's or the field's event's `source` (`[of]`). */
function refsOf(event: ScriptEvent): PokemonRef[] {
  if (event.kind === 'move' || event.kind === 'miss') {
    return event.target === undefined ? [event.user] : [event.user, event.target]
  }
  if ('who' in event) return [event.who]
  return 'source' in event ? [event.source] : []
}

/** The issue an action waits for whole: a charge turn, a look of its own or several hits
 * (D11), or a called move. */
function heldBy(action: Action): number | undefined {
  const kinds = new Set(action.map((event) => event.kind))
  if (kinds.has('prepare') || kinds.has('anim') || kinds.has('hitCount')) return WHOLE
  const [first] = action
  return first?.kind === 'move' && first.calledBy !== undefined ? WHOLE : undefined
}

/** An action as it plays: its move when that plays, and else the issue its events wait for. */
interface Played {
  readonly action: Action
  readonly move: PlayedMove | undefined
  readonly waits: number | undefined
}

/** `action` with the move that opens it, when that plays: no wait of the whole action. Its user
 * and target must stand in place. */
function playedOf(action: Action, state: BattleState): Played {
  const [first] = action
  const held = heldBy(action)
  if (first?.kind !== 'move' || held !== undefined) return { action, move: undefined, waits: held }
  const targetRef = first.target ?? first.user
  const user = state.placed(first.user, first.line)
  const target = state.placed(targetRef, first.line)
  return { action, move: { user, target, targetRef, move: gen5Move(first.move) }, waits: undefined }
}

/** The kinds of event after a move that mean the server took its target out. */
const NO_TARGET_LEFT: ReadonlySet<ScriptEvent['kind']> = new Set(['miss', 'immune', 'fail'])

/** A block by Protect, Detect or another protection Gen 5 has: the moves @pkmn's Gen 5 data
 * marks as stalling moves. The script reads Showdown's `-activate|…|move: Protect` as a block,
 * and Detect's under Protect's name; Endure, the one other stalling move, blocks nothing. */
function isProtection(event: ScriptEvent): boolean {
  return (
    event.kind === 'block' &&
    event.effect.kind === 'move' &&
    gen5.moves.get(event.effect.name)?.stallingMove === true
  )
}

/** ServerControl_Fight's SC_MOVE_MSG, then the SC_MOVE_ANIM that ServerControl_ExecuteMove
 * reserves and ServerControl_PutMoveAnimation fills. It stays empty for a move with no
 * animation, a miss, and a move whose first event after it shows that the server took its one
 * target out: a miss (ServerControl_RemoveHiddenTargets, ServerControl_RemoveMissedTargets), an
 * immunity (ServerControl_CheckMoveEffectiveness), a protection's block
 * (ServerControl_RemoveNoEffectTargets) or a failure (no target left). */
function moveCommands(action: Action, move: PlayedMove): ServerCommand[] {
  const [first, next] = action
  const message = { command: 'SC_MOVE_MSG', args: [move.user.monId, move.move] }
  const quiet =
    (first?.kind === 'move' && (first.still === true || first.miss === true)) ||
    (next !== undefined && (NO_TARGET_LEFT.has(next.kind) || isProtection(next)))
  if (quiet) return [message]
  const args = [move.user.pos, move.target.pos, move.move, PLAIN_TURN]
  return [message, { command: 'SC_MOVE_ANIM', args }]
}

/** Where an event stands: its action as it plays, its index there and in the script's events. */
interface Place {
  readonly played: Played
  readonly index: number
  readonly at: number
}

/** The commands of an event of an effect or a hit (effects.ts, hits.ts), or undefined. The
 * effects come first: a Substitute's start wrote its HP drop, which no hit may play again. */
function playedCommands(scene: Scene, { played, index, at }: Place, event: ScriptEvent) {
  const { action, move } = played
  if (event.kind === 'move') return move && moveCommands(action, move)
  const effect = { ...scene, events: scene.script.events, action, index, at }
  return (
    effectCommands(effect, event) ??
    hitCommands({ state: scene.state, numbers: scene.numbers, move }, event)
  )
}

/** The commands of one event; a fallback for an event whose rule plays it but which does not
 * (lane plan D13). */
function eventCommands(scene: Scene, place: Place, event: ScriptEvent): ServerCommand[] {
  const hits = { state: scene.state, numbers: scene.numbers, move: place.played.move }
  if (scene.outcomes.get(event)?.as !== 'play') return silentBar(hits, event)
  if (event.kind === 'switchIn') return switchCommands(scene, event)
  if (event.kind === 'faint') return faintCommands(scene, event)
  for (const ref of refsOf(event)) scene.state.placed(ref, event.line)
  const commands = playedCommands(scene, place, event)
  if (commands !== undefined) return commands
  scene.fallbacks.push(laterFallback(event, place.played.waits ?? WHOLE))
  return silentBar(hits, event)
}

/** What one event writes: ServerControl_TurnCheck's SC_HIDE_MSG_WINDOW before the first commands
 * of a turn's end (lane plan D9), and a Substitute's start shows its HP drop's line (D10). */
function writtenOf(scene: Scene, place: Place, event: ScriptEvent): Written {
  const { line } = event
  const commands = eventCommands(scene, place, event)
  const shows = substituteShows(scene.script.events, place.at)
  const opens = commands.length > 0 && !scene.hidden && scene.residual(line)
  if (opens) scene.hidden = true
  const hide = { command: 'SC_HIDE_MSG_WINDOW', args: [scene.numbers.effects.hideWindow] }
  const all = opens ? [hide, ...commands] : commands
  return shows.length > 0 && commands.length > 0
    ? { line, commands: all, shows }
    : { line, commands: all }
}

/** The scene after `event`: a turn's number with the window not yet hidden, a move as the last
 * one, a faint's HP at 0, the end of a disguise as the real Pokémon's alias. */
function follow(scene: Scene, event: ScriptEvent): void {
  if (event.kind === 'turn') {
    scene.turn = event.number
    scene.hidden = false
  }
  if (event.kind === 'move') scene.lastMove = event
  if (event.kind === 'faint') scene.state.faint(event.who)
  if (event.kind === 'replace') scene.state.alias(event)
}

/** The commands of each action of `script`, in replay order, from the battle's start. */
export function writeScript(
  script: Pick<BattleScript, 'teams' | 'events' | 'dropped'>,
  numbers: WriteNumbers,
): ScriptWrite {
  const outcomes = outcomesOf(script.events)
  const scene: Scene = {
    state: battleState(script, numbers.battle),
    numbers,
    script,
    outcomes: new Map(script.events.map((event, i) => [event, outcomes[i]])),
    residual: residualOf(script.dropped),
    fallbacks: [],
    turn: 0,
    lastMove: undefined,
    hidden: false,
  }
  const { state } = scene
  const orders: PartyOrders[] = []
  let at = 0
  const actions = actionsOf(script).map((action) => {
    const played = playedOf(action, state)
    return action.map((event, index) => {
      const written = writtenOf(scene, { played, index, at }, event)
      at += 1
      follow(scene, event)
      const { line } = event
      orders.push({ line, near: state.partyMonIds('near'), far: state.partyMonIds('far') })
      return written
    })
  })
  return { actions, fallbacks: scene.fallbacks, orders }
}
