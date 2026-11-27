// What each action of a battle script writes into Black 2's battle (#107, #108, lane plans D5,
// D6, D11 and D1): a move sends its line and its animation, as ServerControl_Fight and
// ServerControl_ExecuteMove do, and each event after it plays by its rule (hits.ts). A switch-in
// after the leads plays its switch, drag or send-in (switches.ts) and moves the places; each faint
// plays the server's faint (faints.ts) and takes its Pokémon's HP to 0, and the end of Illusion's
// disguise keeps the game's Pokémon in place (battle-state.ts). An event that plays and names a
// Pokémon not in place fails by name. An action with a called move, several hits, a charge turn
// or a look of its own waits whole. Pure: every number of the game comes in from
// build/gen5/bw2.json.
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { PokemonRef } from '../../script/types.ts'
import type { BattleNumbers, FlowNumbers, TextNumbers } from '../bw2-numbers.ts'
import { PLAIN_TURN } from '../moment.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { battleState, type BattleState } from './battle-state.ts'
import { type Action, actionsOf, type Written } from './blocks.ts'
import { faintCommands } from './faints.ts'
import { type Gen5Fallback, laterFallback } from './fallbacks.ts'
import { hitCommands, type PlayedMove, silentBar } from './hits.ts'
import { gen5, gen5Move } from './names.ts'
import { type EventOf, LATER_ISSUES, type Outcome, outcomesOf } from './rules.ts'
import { switchCommands } from './switches.ts'

/** The numbers the writer takes. */
export interface WriteNumbers {
  readonly text: TextNumbers
  readonly flow: FlowNumbers
  readonly battle: Pick<BattleNumbers, 'single' | 'monIds'>
}

/** What a script writes: each action's commands by event, and a fallback for each event whose
 * rule plays it but which does not play here. */
export interface ScriptWrite {
  readonly actions: Written[][]
  readonly fallbacks: Gen5Fallback[]
}

const { effects: EFFECTS, whole: WHOLE } = LATER_ISSUES

/** What the writer carries through the script: the turn the log began last and its last move
 * follow the events (`follow`). */
interface Scene {
  readonly state: BattleState
  readonly numbers: WriteNumbers
  readonly outcomes: ReadonlyMap<ScriptEvent, Outcome | undefined>
  readonly fallbacks: Gen5Fallback[]
  turn: number
  lastMove: EventOf<'move'> | undefined
}

/** The Pokémon an event of a kind that plays names: a move's or a miss's user and target,
 * every other kind's `who`. */
function refsOf(event: ScriptEvent): PokemonRef[] {
  if (event.kind === 'move' || event.kind === 'miss') {
    return event.target === undefined ? [event.user] : [event.user, event.target]
  }
  return 'who' in event ? [event.who] : []
}

/** The issue an action waits for whole: a charge turn, a look of its own or several hits
 * (D11), or a called move. */
function heldBy(action: Action): number | undefined {
  const kinds = new Set(action.map((event) => event.kind))
  if (kinds.has('prepare') || kinds.has('anim') || kinds.has('hitCount')) return WHOLE
  const [first] = action
  return first?.kind === 'move' && first.calledBy !== undefined ? EFFECTS : undefined
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

/** The commands of one event; a fallback for an event whose rule plays it but which does not. */
function eventCommands(scene: Scene, played: Played, event: ScriptEvent): ServerCommand[] {
  const { action, move } = played
  const hits = { state: scene.state, numbers: scene.numbers, move }
  if (scene.outcomes.get(event)?.as !== 'play') return silentBar(hits, event)
  if (event.kind === 'switchIn') return switchCommands(scene, event)
  if (event.kind === 'faint') return faintCommands(scene, event)
  for (const ref of refsOf(event)) scene.state.placed(ref, event.line)
  const commands =
    event.kind === 'move' ? move && moveCommands(action, move) : hitCommands(hits, event)
  if (commands !== undefined) return commands
  scene.fallbacks.push(laterFallback(event, played.waits ?? WHOLE))
  return silentBar(hits, event)
}

/** The scene after `event`: a turn's number, a move as the last one, a faint's HP at 0, the end
 * of a disguise as the real Pokémon's alias. */
function follow(scene: Scene, event: ScriptEvent): void {
  if (event.kind === 'turn') scene.turn = event.number
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
    outcomes: new Map(script.events.map((event, i) => [event, outcomes[i]])),
    fallbacks: [],
    turn: 0,
    lastMove: undefined,
  }
  const actions = actionsOf(script).map((action) => {
    const played = playedOf(action, scene.state)
    return action.map((event) => {
      const commands = eventCommands(scene, played, event)
      follow(scene, event)
      return { line: event.line, commands }
    })
  })
  return { actions, fallbacks: scene.fallbacks }
}
