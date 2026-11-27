// The end of a replay's battle (#110, lane plan D14): who won, or a tie, and the simulator's
// messages after the last turn, such as a forfeit. Under gen5-battle-end's interim answer the
// game holds the last scene, and the run's log (and later the page) names the end beside it.
// Game-neutral and pure; the Gen 5 replay keeps its shape (D18).
import type { BattleScript, ScriptEvent } from '../../script/events.ts'

type ResultEvent = Extract<ScriptEvent, { kind: 'win' | 'tie' }>
type SimulatorMessage = Extract<ScriptEvent, { kind: 'message' }>

/** The battle's result, none for a log that stops before it, and the messages after the last
 * turn. */
export interface ReplayEnd {
  readonly result: ResultEvent | undefined
  readonly messages: readonly SimulatorMessage[]
}

const isResult = (event: ScriptEvent): event is ResultEvent =>
  event.kind === 'win' || event.kind === 'tie'
const isMessage = (event: ScriptEvent): event is SimulatorMessage => event.kind === 'message'

/** The script's last win or tie, and each message after its last turn. */
export function replayEnd(script: Pick<BattleScript, 'events'>): ReplayEnd {
  const { events } = script
  const lastTurn = events.findLastIndex((event) => event.kind === 'turn')
  return {
    result: events.findLast(isResult),
    messages: events.slice(lastTurn + 1).filter(isMessage),
  }
}
