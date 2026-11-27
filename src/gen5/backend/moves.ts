// What each action of a battle script writes into Black 2's battle (#107, lane plan D5, D6, D11):
// a move whose user and target stand in place sends its line and its animation, as
// ServerControl_Fight and ServerControl_ExecuteMove do, and each event after it plays by its
// rule (hits.ts). An event of a Pokémon not in place waits for #108, and an action with a called
// move, several hits, a charge turn or a look of its own waits whole. Pure: every number of the
// game comes in from build/gen5/bw2.json.
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { PokemonRef } from '../../script/types.ts'
import type { BattleNumbers, FlowNumbers, TextNumbers } from '../bw2-numbers.ts'
import { PLAIN_TURN } from '../moment.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { battleState, type BattleState } from './battle-state.ts'
import { type Action, actionsOf, type Written } from './blocks.ts'
import { type Gen5Fallback, laterFallback } from './fallbacks.ts'
import { hitCommands, type PlayedMove, silentBar } from './hits.ts'
import { gen5Move } from './names.ts'
import { LATER_ISSUES, type Outcome, outcomesOf } from './rules.ts'

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

const { switches: SWITCHES, effects: EFFECTS, whole: WHOLE } = LATER_ISSUES

interface Scene {
  readonly state: BattleState
  readonly numbers: WriteNumbers
  readonly outcomes: ReadonlyMap<ScriptEvent, Outcome | undefined>
  readonly fallbacks: Gen5Fallback[]
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

/** `action` with the move that opens it, when that plays: no wait of the whole action, and its
 * user and target in place. A move of a Pokémon not in place waits for #108 with its events. */
function playedOf(action: Action, state: BattleState): Played {
  const [first] = action
  const held = heldBy(action)
  if (first?.kind !== 'move' || held !== undefined) return { action, move: undefined, waits: held }
  const targetRef = first.target ?? first.user
  const user = state.inPlace(first.user)
  const target = state.inPlace(targetRef)
  if (user === undefined || target === undefined) {
    return { action, move: undefined, waits: SWITCHES }
  }
  return { action, move: { user, target, targetRef, move: gen5Move(first.move) }, waits: undefined }
}

/** ServerControl_Fight's SC_MOVE_MSG, then the SC_MOVE_ANIM that ServerControl_ExecuteMove
 * reserves and ServerControl_PutMoveAnimation fills. It stays empty for a move with no
 * animation, a miss, and a move whose first event after it is a miss, an immunity or a failure
 * (ServerControl_RemoveMissedTargets, ServerControl_CheckMoveEffectiveness). */
function moveCommands(action: Action, move: PlayedMove): ServerCommand[] {
  const [first, next] = action
  const message = { command: 'SC_MOVE_MSG', args: [move.user.monId, move.move] }
  const quiet =
    (first?.kind === 'move' && (first.still === true || first.miss === true)) ||
    (next !== undefined && ['miss', 'immune', 'fail'].includes(next.kind))
  if (quiet) return [message]
  const args = [move.user.pos, move.target.pos, move.move, PLAIN_TURN]
  return [message, { command: 'SC_MOVE_ANIM', args }]
}

/** The commands of one event; a fallback for an event whose rule plays it but which does not. */
function eventCommands(scene: Scene, played: Played, event: ScriptEvent): ServerCommand[] {
  const { action, move } = played
  const hits = { state: scene.state, numbers: scene.numbers, move }
  if (scene.outcomes.get(event)?.as !== 'play') return silentBar(hits, event)
  if (!refsOf(event).every((ref) => scene.state.inPlace(ref) !== undefined)) {
    scene.fallbacks.push(laterFallback(event, SWITCHES))
    return []
  }
  const commands =
    event.kind === 'move' ? move && moveCommands(action, move) : hitCommands(hits, event)
  if (commands !== undefined) return commands
  scene.fallbacks.push(laterFallback(event, played.waits ?? WHOLE))
  return silentBar(hits, event)
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
  }
  const actions = actionsOf(script).map((action) => {
    const played = playedOf(action, scene.state)
    return action.map((event) => ({
      line: event.line,
      commands: eventCommands(scene, played, event),
    }))
  })
  return { actions, fallbacks: scene.fallbacks }
}
