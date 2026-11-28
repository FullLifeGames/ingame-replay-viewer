// The blocks of a Gen 5 replay (#107, lane plan D7 and D10): the battle script's events as
// actions, and the commands each action writes as named blocks for the player's client. An action
// opens at a move, a `cant` and a switch-in after the leads, and closes at the next one or at a
// turn. Between a turn's residual mark and its `|upkeep|` line each event is an action of its
// own: the mark is the last spacer line before `|upkeep|`, both dropped lines of the script. So
// is each event that prints (#118), after the action it stands in. A block holds at most the room
// of the adapter and the client's queue (`blockRoom`), and an action past it splits between
// commands. Each page of a printed event is a block of its own that sends the carrier alone (lane
// plan D4).
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { DroppedLine } from '../../script/types.ts'
import type { ServerCmdTable } from '../bw2-numbers.ts'
import { packCommands, type ServerCommand } from '../server-cmd.ts'
import type { Gen5Block } from './replay.ts'
import { afterLeads, outcomesOf } from './rules.ts'

/** The events that play as one block, in log order. */
export type Action = readonly ScriptEvent[]

/** The commands one event of an action writes, and the log lines it shows besides its own, as a
 * Substitute's start shows its HP drop (lane plan D10). An event that prints gives its pages,
 * and its commands are the carrier, which each page sends (printed.ts). */
export interface Written {
  readonly line: number
  readonly commands: readonly ServerCommand[]
  readonly shows?: readonly number[]
  readonly pages?: readonly string[]
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

/** Whether a log line stands between a turn's residual mark and its `|upkeep|` line. */
export function residualOf(dropped: readonly DroppedLine[]): (line: number) => boolean {
  const spans = residualSpans(dropped)
  return (line) => spans.some(({ from, to }) => from < line && line < to)
}

const isOpener = (event: ScriptEvent, afterTheLeads: boolean) =>
  event.kind === 'move' || event.kind === 'cant' || (event.kind === 'switchIn' && afterTheLeads)

/** How an event cuts the actions: alone in an action of its own, opening one, or printing. */
interface Cut {
  readonly event: ScriptEvent
  readonly alone: boolean
  readonly opens: boolean
  readonly prints: boolean
}

/** Each event of `script` with its cut, in log order. */
function cutsOf(script: Pick<BattleScript, 'events' | 'dropped'>): Cut[] {
  const residual = residualOf(script.dropped)
  const after = afterLeads(script.events)
  const outcomes = outcomesOf(script.events)
  return script.events.map((event, i) => {
    const prints = outcomes[i]?.as === 'print'
    const alone = event.kind === 'turn' || residual(event.line) || prints
    return { event, alone, opens: !alone && isOpener(event, after[i] ?? false), prints }
  })
}

/** The script's events as actions, every event in one action, in log order but one: an event that
 * prints amid an open action waits for that action's end, so the action plays whole (#118). */
export function actionsOf(script: Pick<BattleScript, 'events' | 'dropped'>): Action[] {
  const actions: ScriptEvent[][] = []
  let open: ScriptEvent[] | undefined
  let waiting: ScriptEvent[][] = []
  for (const { event, alone, opens, prints } of cutsOf(script)) {
    if (open !== undefined && prints) waiting.push([event])
    else if (open !== undefined && !alone && !opens) open.push(event)
    else {
      actions.push(...waiting, [event])
      waiting = []
      open = opens ? actions.at(-1) : undefined
    }
  }
  return [...actions, ...waiting]
}

interface Part {
  readonly lines: number[]
  readonly commands: ServerCommand[]
  bytes: number
  readonly print?: string
}

/** The bytes `command` of log line `line` packs to; throws when that alone passes the room. */
function bytesOf({ table, room }: Packing, command: ServerCommand, line: number): number {
  const bytes = packCommands(table, [command]).length
  if (bytes > room) {
    const at = `${command.command} (line ${String(line)})`
    throw new RangeError(`${at} packs to ${String(bytes)} bytes; a block holds ${String(room)}`)
  }
  return bytes
}

/** A part of its own for each page of a printed event, each with the event's commands. */
function pageParts({ line, commands, pages = [] }: Written, packing: Packing): Part[] {
  const bytes = commands.reduce((sum, command) => sum + bytesOf(packing, command, line), 0)
  return pages.map((print) => ({ lines: [line], commands: [...commands], bytes, print }))
}

/** `written`'s commands packed into `open` and the parts after it, which go into `parts`; the
 * last part stays open. */
function packInto(parts: Part[], open: Part | undefined, written: Written, packing: Packing) {
  const { line, commands, shows = [] } = written
  let part = open
  for (const [i, command] of commands.entries()) {
    const bytes = bytesOf(packing, command, line)
    if (part === undefined || part.bytes + bytes > packing.room) {
      part = { lines: [], commands: [], bytes: 0 }
      parts.push(part)
    }
    part.commands.push(command)
    part.bytes += bytes
    for (const shown of [line, ...(i === 0 ? shows : [])]) {
      if (!part.lines.includes(shown)) part.lines.push(shown)
    }
  }
  return part
}

/** An action's commands in parts of at most the room, each printed page a part of its own; throws
 * on a command that alone passes it. */
function partsOf(action: readonly Written[], packing: Packing): Part[] {
  const parts: Part[] = []
  let open: Part | undefined
  for (const written of action) {
    if (written.pages === undefined) {
      open = packInto(parts, open, written, packing)
      continue
    }
    parts.push(...pageParts(written, packing))
    open = undefined
  }
  return parts
}

/** The blocks of the actions' commands, named `b1`, `b2`… in replay order; an action that writes
 * no command makes no block. Each block's lines are those of the events that wrote into it. */
export function blocksOf(written: readonly (readonly Written[])[], packing: Packing): Gen5Block[] {
  return written
    .flatMap((action) => partsOf(action, packing))
    .map(({ lines, commands, print }, i) => {
      const block = { name: `b${String(i + 1)}`, lines, commands }
      return print === undefined ? block : { ...block, print }
    })
}
