// Reads a map of pokebw2 (#77): its field script (res/field/scripts/<map>.s) and its events
// (res/field/events/<map>.json). The events carry script numbers and grids but no names, so the
// route's places are keyed by the first line each event's script shows, the battle trigger also by
// the battle its script starts. A script's path here is its fall-through path: the walk enters
// each VMCall and returns, follows each VMJump, passes every conditional statement such as
// VMJumpIf as if its condition failed, and stops at VMHalt.
import type { RoutePlaces, TriggerPlace } from '../src/gen5/bw2-numbers.ts'

/** The map whose events and field script the route crosses. */
export const ROUTE_MAP = {
  events: 'res/field/events/aspertia_city.json',
  script: 'res/field/scripts/aspertia_city.s',
}

/** How the reader finds a place: the line its event's script shows first and, if given, a
 * statement that the script's path reaches. */
interface PlaceKey {
  firstLine: string
  reaches?: string
}

export type RouteKeys = Record<keyof RoutePlaces, PlaceKey>

/** The keys of the route's places in Aspertia City. */
const ROUTE_KEYS: RouteKeys = {
  hughTrigger: { firstLine: 'AspertiaCity_Text_HeeeyHowLongPlanning' },
  battleTrigger: {
    firstLine: 'AspertiaCity_Text_LetsSeeHowGood',
    reaches: 'CallTrainerBattle TRAINER_RIVAL',
  },
  outlookTrigger: { firstLine: 'AspertiaCity_Text_OhGetOutlookAspertias' },
  bianca: { firstLine: 'AspertiaCity_Text_ItsSoooPretty' },
}

interface Statement {
  command: string
  args: string[]
}

interface FieldScript {
  statements: Statement[]
  /** Each label's statement index: the statement right after it. */
  labels: Map<string, number>
}

const LABEL = /^(\w+):$/
/** A line of the map's text file, as the decomp names it (`AspertiaCity_Text_…`). */
const TEXT_LABEL = /^\w+_Text_\w+$/

function parseStatement(line: string): Statement {
  const [command = '', ...rest] = line.split(/\s+/)
  const args = rest
    .join(' ')
    .split(',')
    .map((arg) => arg.trim())
  return { command, args: args.filter((arg) => arg !== '') }
}

function parseScript(text: string): FieldScript {
  const statements: Statement[] = []
  const labels = new Map<string, number>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('//') || line.startsWith('#')) continue
    const label = LABEL.exec(line)?.[1]
    if (label === undefined) statements.push(parseStatement(line))
    else labels.set(label, statements.length)
  }
  return { statements, labels }
}

function entry(script: FieldScript, label: string | undefined): number {
  const at = label === undefined ? undefined : script.labels.get(label)
  if (at === undefined) throw new Error(`the field script has no label ${String(label)}`)
  return at
}

/** The statement after `at` on the path, or undefined where the path ends. */
function next(script: FieldScript, at: number, returns: number[]): number | undefined {
  const { command, args } = script.statements[at] ?? { command: 'VMHalt', args: [] }
  if (command === 'VMHalt') return undefined
  if (command === 'VMReturn') return returns.pop()
  if (command === 'VMJump') return entry(script, args[0])
  if (command === 'VMCall') {
    returns.push(at + 1)
    return entry(script, args[0])
  }
  return at + 1
}

/** The statements on the fall-through path from `label`; a path that comes back to a statement
 * with the same calls open has shown everything it will, so the walk ends there. */
function path(script: FieldScript, label: string): Statement[] {
  const returns: number[] = []
  const seen = new Set<string>()
  const statements: Statement[] = []
  for (
    let at: number | undefined = entry(script, label);
    at !== undefined;
    at = next(script, at, returns)
  ) {
    const state = `${String(at)} ${returns.join(' ')}`
    const statement = script.statements[at]
    if (statement === undefined || seen.has(state)) break
    seen.add(state)
    statements.push(statement)
  }
  return statements
}

/** The text line a message statement shows: its argument that names a line of the text file. */
function shownLine({ command, args }: Statement): string | undefined {
  return command.includes('Msg') ? args.find((arg) => TEXT_LABEL.test(arg)) : undefined
}

const firstLineOn = (script: FieldScript, label: string): string | undefined =>
  path(script, label)
    .map(shownLine)
    .find((line) => line !== undefined)

function reachesOn(script: FieldScript, label: string, wanted: string): boolean {
  const target = parseStatement(wanted)
  return path(script, label).some(
    ({ command, args }) =>
      command === target.command && target.args.every((arg, i) => args[i] === arg),
  )
}

/** The label of the first line that the script at `label` shows, or undefined if it shows none. */
export const firstMessage = (text: string, label: string): string | undefined =>
  firstLineOn(parseScript(text), label)

/** True when the path from `label` reaches a statement with the command and leading arguments of
 * `wanted`, such as `CallTrainerBattle TRAINER_RIVAL`. */
export const reaches = (text: string, label: string, wanted: string): boolean =>
  reachesOn(parseScript(text), label, wanted)

/** One event of the map: the number of its script and its grid. */
interface MapEvent {
  script: number
  grid: { x: number; z: number; width?: number }
}

interface MapEvents {
  triggers: MapEvent[]
  npcs: MapEvent[]
}

function parseEvents(text: string): MapEvents {
  const events = JSON.parse(text) as Partial<MapEvents>
  if (!Array.isArray(events.triggers) || !Array.isArray(events.npcs)) {
    throw new Error('the events file lacks its triggers or its npcs')
  }
  return { triggers: events.triggers, npcs: events.npcs }
}

/** The label of an event's script in the map's field script. */
export const scriptLabel = (event: Pick<MapEvent, 'script'>) => `Script_${String(event.script)}`

/** True when the event's script lies in this file (others, such as shared ones, live elsewhere)
 * and shows the key's line first, reaching the key's statement if it names one. */
function matchesKey(script: FieldScript, event: MapEvent, key: PlaceKey): boolean {
  const label = scriptLabel(event)
  if (!script.labels.has(label) || firstLineOn(script, label) !== key.firstLine) return false
  return key.reaches === undefined || reachesOn(script, label, key.reaches)
}

/** Which list of the map's events each place comes from. */
const PLACE_EVENTS: Record<keyof RoutePlaces, keyof MapEvents> = {
  hughTrigger: 'triggers',
  battleTrigger: 'triggers',
  outlookTrigger: 'triggers',
  bianca: 'npcs',
}

/** Every event that matches each place's key, by place. */
export function placeMatches(
  eventsText: string,
  scriptText: string,
  keys: RouteKeys = ROUTE_KEYS,
): Record<keyof RoutePlaces, MapEvent[]> {
  const events = parseEvents(eventsText)
  const script = parseScript(scriptText)
  const pick = (place: keyof RoutePlaces) =>
    events[PLACE_EVENTS[place]].filter((event) => matchesKey(script, event, keys[place]))
  return {
    hughTrigger: pick('hughTrigger'),
    battleTrigger: pick('battleTrigger'),
    outlookTrigger: pick('outlookTrigger'),
    bianca: pick('bianca'),
  }
}

/** The route's places, each from the one event that matches its key; throws for a key that
 * matches no event or more than one, and for a trigger without a width. */
export function routePlaces(
  eventsText: string,
  scriptText: string,
  keys: RouteKeys = ROUTE_KEYS,
): RoutePlaces {
  const matches = placeMatches(eventsText, scriptText, keys)
  const grid = (place: keyof RoutePlaces) => {
    const hits = matches[place]
    const [only] = hits
    if (only === undefined || hits.length > 1) {
      const count = String(hits.length)
      throw new Error(`${place}: ${count} events show ${keys[place].firstLine} first, not one`)
    }
    return only.grid
  }
  const trigger = (place: keyof RoutePlaces): TriggerPlace => {
    const { x, z, width } = grid(place)
    if (width === undefined) throw new Error(`${place}: the trigger has no width`)
    return { x, z, width }
  }
  const hughTrigger = trigger('hughTrigger')
  const battleTrigger = trigger('battleTrigger')
  const outlookTrigger = trigger('outlookTrigger')
  const { x, z } = grid('bianca')
  return { hughTrigger, battleTrigger, outlookTrigger, bianca: { x, z } }
}
