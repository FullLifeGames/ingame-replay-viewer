// The blocks of a Gen 5 replay (#107, lane plan D7 and D10): the battle script's events as
// actions, and the commands each action writes as named blocks for the player's client. An action
// opens at a move, a `cant` and a switch-in after the leads, and closes at the next one or at a
// turn. Between a turn's residual mark and its `|upkeep|` line each event is an action of its
// own: the mark is the last spacer line before `|upkeep|`, both dropped lines of the script. A
// block holds at most the room of the adapter and the client's queue (`blockRoom`), and an action
// past it splits between commands.
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { DroppedLine } from '../../script/types.ts'
import type { ServerCmdTable } from '../bw2-numbers.ts'
import { packCommands, type ServerCommand } from '../server-cmd.ts'
import type { Gen5Block } from './replay.ts'
import { afterLeads } from './rules.ts'

/** The events that play as one block, in log order. */
export type Action = readonly ScriptEvent[]

/** The commands one event of an action writes. */
export interface Written {
  readonly line: number
  readonly commands: readonly ServerCommand[]
}

/** How blocks pack: the command table and the bytes a block may take. */
interface Packing {
  readonly table: ServerCmdTable
  readonly room: number
}

/** The lines strictly between each turn's residual mark and its `|upkeep|` line. */
function residualSpans(dropped: readonly DroppedLine[]): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = []
  let spacer: number | undefined
  for (const { line, reason } of dropped) {
    if (reason === 'spacer') spacer = line
    if (reason === 'upkeep' && spacer !== undefined) spans.push({ from: spacer, to: line })
    if (reason === 'upkeep') spacer = undefined
  }
  return spans
}

const isOpener = (event: ScriptEvent, afterTheLeads: boolean) =>
  event.kind === 'move' || event.kind === 'cant' || (event.kind === 'switchIn' && afterTheLeads)

/** The script's events as actions, every event in one action, in log order. */
export function actionsOf(script: Pick<BattleScript, 'events' | 'dropped'>): Action[] {
  const spans = residualSpans(script.dropped)
  const residual = (line: number) => spans.some(({ from, to }) => from < line && line < to)
  const after = afterLeads(script.events)
  const actions: ScriptEvent[][] = []
  let open: ScriptEvent[] | undefined
  for (const [i, event] of script.events.entries()) {
    const alone = event.kind === 'turn' || residual(event.line)
    const opens = !alone && isOpener(event, after[i] ?? false)
    if (open !== undefined && !alone && !opens) {
      open.push(event)
      continue
    }
    const action = [event]
    actions.push(action)
    open = opens ? action : undefined
  }
  return actions
}

interface Part {
  readonly lines: number[]
  readonly commands: ServerCommand[]
  bytes: number
}

/** An action's commands in parts of at most the room; throws on a command that alone passes it. */
function partsOf(action: readonly Written[], { table, room }: Packing): Part[] {
  const parts: Part[] = []
  let part: Part | undefined
  const each = action.flatMap(({ line, commands }) =>
    commands.map((command) => ({ line, command })),
  )
  for (const { line, command } of each) {
    const bytes = packCommands(table, [command]).length
    if (bytes > room) {
      const at = `${command.command} (line ${String(line)})`
      throw new RangeError(`${at} packs to ${String(bytes)} bytes; a block holds ${String(room)}`)
    }
    if (part === undefined || part.bytes + bytes > room) {
      part = { lines: [], commands: [], bytes: 0 }
      parts.push(part)
    }
    part.commands.push(command)
    part.bytes += bytes
    if (part.lines.at(-1) !== line) part.lines.push(line)
  }
  return parts
}

/** The blocks of the actions' commands, named `b1`, `b2`… in replay order; an action that writes
 * no command makes no block. Each block's lines are those of the events that wrote into it. */
export function blocksOf(written: readonly (readonly Written[])[], packing: Packing): Gen5Block[] {
  return written
    .flatMap((action) => partsOf(action, packing))
    .map(({ lines, commands }, i) => ({ name: `b${String(i + 1)}`, lines, commands }))
}
