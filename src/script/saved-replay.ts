// A saved replay: a replay the viewer reads from a file (#56). Four kinds: the file of Showdown's
// "Download replay", a replay page saved from a browser, a battle log, and a replay's JSON file.
// The reader runs on files from anywhere, so it builds no document and scans the text with string
// search in one pass; no pattern here backtracks over more than one run of the text.
import { toID } from '@pkmn/dex'

import { isNamedPlayer } from './drops'
import { readLines } from './lines'
import { type Replay, readReplay, ReplayError } from './replay'

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

/** The file's text without a byte-order mark, CRLF read as LF, and blank ends trimmed. */
function bodyOf(text: string): string {
  const unmarked = text.startsWith('\uFEFF') ? text.slice(1) : text
  return unmarked.replaceAll('\r\n', '\n').trim()
}

/** The index of the first match of `pattern` at or after `from`, and the index after it. */
function find(text: string, pattern: string, from: number): [number, number] | undefined {
  const search = new RegExp(pattern, 'gi')
  search.lastIndex = from
  const match = search.exec(text)
  return match ? [match.index, search.lastIndex] : undefined
}

interface StartTag {
  readonly attributes: string
  /** The index after the tag's ">". */
  readonly end: number
}

/** The next start tag named `name` at or after `from`; undefined when none closes with ">". */
function startTag(text: string, name: string, from: number): StartTag | undefined {
  const found = find(text, String.raw`<${name}(?=[\s/>])`, from)
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
  let tag = startTag(text, 'script', 0)
  while (tag !== undefined) {
    const close = find(text, String.raw`<\/script`, tag.end)
    if (close === undefined) return
    yield { attributes: tag.attributes, content: text.slice(tag.end, close[0]) }
    tag = startTag(text, 'script', close[1])
  }
}

/** The value of the attribute `name` in a start tag's attribute text. */
function attribute(attributes: string, name: string): string | undefined {
  const value = String.raw`\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`
  const match = new RegExp(String.raw`(?:^|\s)${name}${value}`, 'i').exec(attributes)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

function hasClass(element: ScriptElement, name: string): boolean {
  return (attribute(element.attributes, 'class') ?? '').split(/\s+/).includes(name)
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
    if (hasClass(element, DATA_CLASS)) {
      return { kind: 'downloaded', text: element.content, id: undefined }
    }
    if (page === undefined && hasClass(element, PAGE_CLASS)) {
      page = { kind: 'page', text: element.content, id: elementId(element) }
    }
  }
  return page
}

/** The value of the downloaded file's `replayid` input. */
function replayId(body: string): string | undefined {
  let tag = startTag(body, 'input', 0)
  while (tag !== undefined && attribute(tag.attributes, 'name') !== 'replayid') {
    tag = startTag(body, 'input', tag.end)
  }
  const value = tag && attribute(tag.attributes, 'value')
  return value === '' ? undefined : value
}

function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
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

function readJson(body: string): Replay {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch (error) {
    throw new ReplayError(KINDS_LINE, { cause: error })
  }
  return readReplay(json)
}

function readPage(body: string, fileName: string): Replay {
  const element = logElement(body)
  const text = element?.text.replaceAll('\\/', '/') ?? ''
  if (element === undefined || text.trim() === '') {
    throw new ReplayError(NO_LOG_LINE)
  }
  return replayOf(element.id ?? replayId(body) ?? withoutExtension(fileName), text)
}

/** Which kind a saved file is, or undefined for a file the reader refuses by its shape. */
export function savedKind(text: string): SavedKind | undefined {
  const body = bodyOf(text)
  return body.startsWith('<') ? logElement(body)?.kind : KIND_BY_START[body.charAt(0)]
}

/**
 * Reads a saved file's text as a replay. A JSON file goes through `readReplay`; the id of a page
 * comes from its log element, its `replayid` input or the file name, and the id of a battle log
 * from the file name. Throws `ReplayError` for a file the viewer cannot read.
 */
export function readSavedReplay(text: string, fileName: string): Replay {
  const body = bodyOf(text)
  if (body === '') {
    throw new ReplayError(EMPTY_LINE)
  }
  if (body.startsWith('{')) {
    return readJson(body)
  }
  if (body.startsWith('<')) {
    return readPage(body, fileName)
  }
  if (body.startsWith('|')) {
    return replayOf(withoutExtension(fileName), body)
  }
  throw new ReplayError(KINDS_LINE)
}
