// A saved replay: a replay the viewer reads from a file (#56). Four kinds: the file of Showdown's
// "Download replay", a replay page saved from a browser, a battle log, and a replay's JSON file.
// The reader runs on files from anywhere, so it builds no document and scans the text with string
// search in one pass; no pattern here backtracks over more than one run of the text.
import { toID } from '@pkmn/dex'

import { isNamedPlayer } from './drops'
import { readLines } from './lines'
import { type Replay, readReplay, ReplayError } from './replay'
import { isReplayId } from './replay-id'

/** Which of the four kinds a saved file is, for the report of a file that failed. */
export type SavedKind = 'json' | 'downloaded' | 'page' | 'log'

const EMPTY_LINE = 'the file is empty'
const KINDS_LINE =
  "the file holds no replay the viewer reads: it reads a replay saved with Showdown's " +
  "Download replay, a saved replay page, a battle log, or a replay's JSON file"
const NO_LOG_LINE = 'the page holds no battle log'

/** The class of the downloaded file's data element and of the replay page's log element. */
const DATA_CLASS = 'battle-log-data'
const PAGE_CLASS = 'log'
/** The replay page names its log element `replaylog-<id>`. */
const ID_PREFIX = 'replaylog-'

const KIND_BY_START: Readonly<Partial<Record<string, SavedKind>>> = { '{': 'json', '|': 'log' }
/** The id of a file whose page, JSON and name hold no replay ID. */
const KIND_IDS: Readonly<Record<SavedKind, string>> = {
  downloaded: 'downloaded-replay',
  page: 'replay-page',
  log: 'battle-log',
  json: 'replay-json',
}

/** A saved file after the reader's one scan: its kind, and the replay it holds. */
export interface SavedReplay {
  /** Undefined for a file the reader refuses by its shape. */
  readonly kind: SavedKind | undefined
  /** Throws `ReplayError` for a file the viewer cannot read. */
  readonly replay: () => Replay
}

interface ScriptElement {
  /** The text between the start tag's attributes and its ">". */
  readonly attributes: string
  readonly content: string
}

interface LogElement {
  readonly kind: 'downloaded' | 'page'
  readonly text: string
  readonly id: string | undefined
}

/** The file's text with CRLF read as LF and blank ends trimmed; `trim` drops a byte-order mark. */
function bodyOf(text: string): string {
  return text.replaceAll('\r\n', '\n').trim()
}

// Each pattern compiles once: a file of many short tags would otherwise compile one per tag.
const SCRIPT_START = /<script(?=[\s/>])/gi
const INPUT_START = /<input(?=[\s/>])/gi
const SCRIPT_END = /<\/script/gi
const VALUE = String.raw`\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`
const attributePattern = (name: string) => new RegExp(String.raw`(?:^|\s)${name}${VALUE}`, 'i')
const ATTRIBUTES = {
  class: attributePattern('class'),
  id: attributePattern('id'),
  name: attributePattern('name'),
  value: attributePattern('value'),
}

/** The index of the first match of `search`, a `g` pattern, at or after `from`, and after it. */
function find(text: string, search: RegExp, from: number): [number, number] | undefined {
  search.lastIndex = from
  const match = search.exec(text)
  return match ? [match.index, search.lastIndex] : undefined
}

interface StartTag {
  readonly attributes: string
  /** The index after the tag's ">". */
  readonly end: number
}

/** The next start tag that `start` finds at or after `from`; undefined when none closes with ">". */
function startTag(text: string, start: RegExp, from: number): StartTag | undefined {
  const found = find(text, start, from)
  const close = found === undefined ? -1 : text.indexOf('>', found[1])
  return found === undefined || close < 0
    ? undefined
    : { attributes: text.slice(found[1], close), end: close + 1 }
}

/**
 * The script elements with their text, in order. A script's text runs to the next `</script`,
 * as in a browser, so a tag written inside a script is text; the scan ends at an unclosed one.
 */
function* scripts(text: string): Generator<ScriptElement> {
  let tag = startTag(text, SCRIPT_START, 0)
  while (tag !== undefined) {
    const close = find(text, SCRIPT_END, tag.end)
    if (close === undefined) return
    yield { attributes: tag.attributes, content: text.slice(tag.end, close[0]) }
    tag = startTag(text, SCRIPT_START, close[1])
  }
}

/** The value of the attribute `name` in a start tag's attribute text. */
function attribute(attributes: string, name: keyof typeof ATTRIBUTES): string | undefined {
  const match = ATTRIBUTES[name].exec(attributes)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

/** The tokens of the element's class attribute. */
function classesOf(element: ScriptElement): readonly string[] {
  return (attribute(element.attributes, 'class') ?? '').split(/\s+/)
}

/** The replay's id from the log element's `id`, when it names one. */
function elementId(element: ScriptElement): string | undefined {
  const id = attribute(element.attributes, 'id') ?? ''
  return id.startsWith(ID_PREFIX) && id.length > ID_PREFIX.length
    ? id.slice(ID_PREFIX.length)
    : undefined
}

/** The downloaded file's data element, else the first replay page log element. */
function logElement(body: string): LogElement | undefined {
  let page: LogElement | undefined
  for (const element of scripts(body)) {
    const classes = classesOf(element)
    if (classes.includes(DATA_CLASS)) {
      return { kind: 'downloaded', text: element.content, id: undefined }
    }
    if (page === undefined && classes.includes(PAGE_CLASS)) {
      page = { kind: 'page', text: element.content, id: elementId(element) }
    }
  }
  return page
}

/** The value of the downloaded file's `replayid` input. */
function replayId(body: string): string | undefined {
  let tag = startTag(body, INPUT_START, 0)
  while (tag !== undefined && attribute(tag.attributes, 'name') !== 'replayid') {
    tag = startTag(body, INPUT_START, tag.end)
  }
  const value = tag && attribute(tag.attributes, 'value')
  return value === '' ? undefined : value
}

function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** The first of `sources` that gives a replay ID, read in order, else the kind's own id. */
function usableId(kind: SavedKind, sources: readonly (() => string | undefined)[]): string {
  for (const source of sources) {
    const id = source()
    if (id !== undefined && isReplayId(id)) return id
  }
  return KIND_IDS[kind]
}

/** The format and the players, from the log's first `|tier|` line and its named player lines. */
function fieldsOf(log: string): Pick<Replay, 'format' | 'formatid' | 'players'> {
  let format: string | undefined
  const players = new Map<string, string>()
  for (const { args } of readLines(log)) {
    if (args[0] === 'tier') {
      format ??= args[1]
    } else if (isNamedPlayer(args) && !players.has(args[1])) {
      players.set(args[1], args[2])
    }
  }
  const names = [players.get('p1'), players.get('p2')]
  return {
    format: format ?? '',
    formatid: toID(format),
    players: names.filter((name) => name !== undefined),
  }
}

/** A replay from a log read out of a file: the log ends with one newline. */
function replayOf(id: string, text: string): Replay {
  const log = `${text.trim()}\n`
  return { id, ...fieldsOf(log), log }
}

function readJson(body: string, fileName: string): Replay {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch (error) {
    throw new ReplayError(KINDS_LINE, { cause: error })
  }
  const replay = readReplay(json)
  return { ...replay, id: usableId('json', [() => replay.id, () => withoutExtension(fileName)]) }
}

function readPage(body: string, element: LogElement | undefined, fileName: string): Replay {
  const text = element?.text.replaceAll('\\/', '/') ?? ''
  if (element === undefined || text.trim() === '') {
    throw new ReplayError(NO_LOG_LINE)
  }
  const sources = [() => element.id, () => replayId(body), () => withoutExtension(fileName)]
  return replayOf(usableId(element.kind, sources), text)
}

function readText(body: string, kind: SavedKind | undefined, fileName: string): Replay {
  if (body === '') {
    throw new ReplayError(EMPTY_LINE)
  }
  if (kind === 'json') {
    return readJson(body, fileName)
  }
  if (kind === 'log') {
    return replayOf(usableId(kind, [() => withoutExtension(fileName)]), body)
  }
  throw new ReplayError(KINDS_LINE)
}

/**
 * Reads a saved file's text in one scan: its kind, and the replay it holds. A JSON file goes
 * through `readReplay`. The id comes from the first source with a replay ID's shape: a page's log
 * element, its `replayid` input, or a JSON file's id, then the file name, then the kind's own id.
 */
export function readSavedFile(text: string, fileName: string): SavedReplay {
  const body = bodyOf(text)
  if (body.startsWith('<')) {
    const element = logElement(body)
    return { kind: element?.kind, replay: () => readPage(body, element, fileName) }
  }
  const kind = KIND_BY_START[body.charAt(0)]
  return { kind, replay: () => readText(body, kind, fileName) }
}
