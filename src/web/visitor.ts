// The lines both pages show a visitor (#59): for each failure, what went wrong and what to do
// next. The module's own words stay as the detail, which the pages show under "Details", so the
// build commands stay on the page for whoever runs the dev server. A line's values come from
// other people's replays, links and files: the pages write a line as text, a value fills its slot
// once, and a value from outside is cut to SLOT_LONGEST characters. A line whose entry says so
// gets the report link (report-link.ts).
import { Gen3Error, GenerationRefusal } from '../gen3/errors'
import { BpsError } from '../patch/bps-format'
import { SlotError, SlotMismatchError } from '../patch/slot'
import { GameTypeRefusal, ScriptError } from '../script/errors'
import { ReplayError } from '../script/replay'
import { EmulatorError } from './emulator'
import type { EnvironmentProblem } from './environment'
import { FetchError } from './fetch'
import { messageOf } from './message'
import {
  FileSizeError,
  LARGEST_FILE_MB,
  type ReplayPlace,
  type ReplaySource,
  SessionError,
} from './replay-choice'
import { REPLAY_HOST, ReplayInputError } from './replay-input'
import { clip } from './report-link'
import { BuildMismatchError, DumpRefusal } from './rom'
import { MemoryRefusal, RunFailure, type RunFailureKind } from './wasm/failures'

/** The formats the viewer plays; the viewer's intro names them too. */
export const PLAYED_FORMATS = 'Gen 1 to 3 singles'

const REPORT = 'Report it with the link below.'
const RELOAD = 'Reload the page. If it fails again, report it with the link below.'

/** A visitor line with its `{slot}` markers, and whether the report link shows under it. */
interface VisitorEntry {
  readonly text: string
  readonly report: boolean
}

/** Every line the pages show a visitor for a failure. */
export const VISITOR_LINES = {
  generation: {
    text: 'This replay is a Gen {gen} battle. The viewer plays {formats} for now.',
    report: false,
  },
  gameType: {
    text: 'This replay is not a singles battle (Showdown calls it "{gameType}"). The viewer plays singles for now.',
    report: false,
  },
  linkReplay: {
    text: 'Showdown sent no replay for this link. Check the link and try again.',
    report: false,
  },
  fileReplay: {
    text:
      'This file holds no Showdown replay. The viewer reads a replay saved with "Download replay", ' +
      "a saved replay page, a battle log, or a replay's JSON file.",
    report: false,
  },
  wrongDump: { text: 'This file is not US Emerald. Pick your US Emerald dump.', report: false },
  scriptLine: {
    text: `The viewer cannot follow line {line} of this replay's battle log. ${REPORT}`,
    report: true,
  },
  game: { text: `The game cannot show this replay. ${REPORT}`, report: true },
  showdownMissing: { text: 'Showdown has no replay with this ID.', report: false },
  showdownUnreachable: {
    text: `The page could not reach ${REPLAY_HOST}. Check your connection and try again.`,
    report: false,
  },
  showdownRefused: {
    text: 'Showdown could not send this replay ({status}). Try again later.',
    report: false,
  },
  ownFile: {
    text: `The page could not load its game file {file} ({status}). ${RELOAD}`,
    report: true,
  },
  buildMismatch: { text: `The site's game files do not match each other. ${RELOAD}`, report: true },
  gameStopped: { text: `The game stopped during this replay. ${REPORT}`, report: true },
  insecure: { text: 'This page needs HTTPS. Open {address}.', report: false },
  isolation: {
    text: `Your browser did not isolate this page, so the game cannot run. ${RELOAD}`,
    report: true,
  },
  fileTooLarge: {
    text: '{file} holds {size} MB, and the viewer reads replay files up to {largest} MB. Pick the replay file you saved from Showdown.',
    report: false,
  },
  /** A module's words that speak to visitors already: Start, memory, the emulator. */
  kept: { text: '{words}', report: false },
  unknown: { text: `The page hit a problem it has no line for. ${REPORT}`, report: true },
} as const satisfies Record<string, VisitorEntry>

type LineName = keyof typeof VISITOR_LINES
type Values = Readonly<Record<string, string>>

/** What a page shows for a failure: the visitor line, the module's words, and the report link. */
export interface VisitorLine {
  readonly line: string
  /** The module's own words, for "Details". */
  readonly detail: string
  /** Whether the report link shows under the line. */
  readonly report: boolean
  /** The replay the report names, when the failure belongs to one. */
  readonly replay?: string
}

/** The longest value from a replay, a link or a file that a line holds, in characters. */
const SLOT_LONGEST = 120

const SLOT = /\{(\w+)\}/g

/** `text` with each `{slot}` filled once from `values`; a slot without a value stays as written. */
export const fillLine = (text: string, values: Values): string =>
  text.replace(SLOT, (slot, name: string) => values[name] ?? slot)

interface Match {
  readonly name: LineName
  readonly values?: Values
}

/** What a rule knows besides the error: the pick's source and the words the page shows today. */
interface Context {
  readonly source: ReplaySource | undefined
  readonly words: string
}

type Rule = (error: unknown, context: Context) => Match | undefined

const RUN_LINES: Readonly<Record<RunFailureKind, LineName>> = {
  stopped: 'gameStopped',
  returned: 'gameStopped',
  mismatch: 'buildMismatch',
  instantiate: 'buildMismatch',
  write: 'game',
  memory: 'kept',
}

const REPLAY_LINES: Partial<Record<ReplaySource, LineName>> = {
  link: 'linkReplay',
  file: 'fileReplay',
}

const isShowdown = (url: string): boolean =>
  URL.canParse(url) && new URL(url).hostname === REPLAY_HOST

const fileOf = (url: string): string => url.replace(/[?#].*$/, '').replace(/^.*\//, '')

function fetchMatch({ url, status }: FetchError): Match {
  if (!isShowdown(url)) {
    const answered = status === undefined ? 'no answer' : String(status)
    return { name: 'ownFile', values: { file: fileOf(url), status: answered } }
  }
  if (status === undefined) return { name: 'showdownUnreachable' }
  if (status === 404) return { name: 'showdownMissing' }
  // Showdown answered 2xx with text that is no JSON.
  if (status >= 200 && status < 300) return { name: 'linkReplay' }
  return { name: 'showdownRefused', values: { status: String(status) } }
}

const KEPT = [ReplayInputError, MemoryRefusal, EmulatorError, SessionError]
const MISMATCHES = [BuildMismatchError, SlotMismatchError, BpsError]
// By its name: a browser without WebAssembly still loads this module and shows its lines.
const isCompileError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'CompileError'
const isOne = (error: unknown, kinds: readonly (abstract new (...args: never) => Error)[]) =>
  kinds.some((kind) => error instanceof kind)

const named = (name: LineName, test: (error: unknown) => boolean): Rule => {
  const match = { name }
  return (error) => (test(error) ? match : undefined)
}

/** The rules in order: a typed refusal before its parent, the build mismatch before RomError. */
const RULES: readonly Rule[] = [
  (error) =>
    error instanceof GenerationRefusal
      ? { name: 'generation', values: { gen: String(error.gen), formats: PLAYED_FORMATS } }
      : undefined,
  (error) =>
    error instanceof GameTypeRefusal
      ? { name: 'gameType', values: { gameType: clip(error.gameType, SLOT_LONGEST) } }
      : undefined,
  (error, { source }) => {
    const name = source === undefined ? undefined : REPLAY_LINES[source]
    return error instanceof ReplayError && name !== undefined ? { name } : undefined
  },
  (error) =>
    error instanceof ScriptError
      ? { name: 'scriptLine', values: { line: String(error.line + 1) } }
      : undefined,
  named('buildMismatch', (error) => isOne(error, MISMATCHES) || isCompileError(error)),
  named('game', (error) => error instanceof Gen3Error || error instanceof SlotError),
  named('wrongDump', (error) => error instanceof DumpRefusal),
  (error) => (error instanceof FetchError ? fetchMatch(error) : undefined),
  (error, { words }) =>
    error instanceof RunFailure ? { name: RUN_LINES[error.kind], values: { words } } : undefined,
  (error) =>
    error instanceof FileSizeError
      ? {
          name: 'fileTooLarge',
          values: {
            file: clip(error.fileName, SLOT_LONGEST),
            size: error.megabytes,
            largest: String(LARGEST_FILE_MB),
          },
        }
      : undefined,
  (error, { words }) => (isOne(error, KEPT) ? { name: 'kept', values: { words } } : undefined),
]

const placeOf = ({ source, replay }: SessionError): ReplayPlace | undefined =>
  source === undefined || replay === undefined ? undefined : { source, replay }

/** The module's error under the steps, and the place the outermost step that names one gives. */
function unwrap(error: unknown): { root: unknown; place: ReplayPlace | undefined } {
  let root = error
  let place: ReplayPlace | undefined
  while (root instanceof SessionError) {
    place ??= placeOf(root)
    if (root.cause === undefined) break
    root = root.cause
  }
  return { root, place }
}

/**
 * The line for `error`, a thrown value or a RunFailure; `place` names the replay when the error
 * names none, as a run's failure does.
 */
export function visitorLine(error: unknown, place?: ReplayPlace): VisitorLine {
  const { root, place: own } = unwrap(error)
  const at = own ?? place
  const context: Context = { source: at?.source, words: messageOf(error) }
  let match: Match = { name: 'unknown' }
  for (const rule of RULES) {
    const found = rule(root, context)
    if (found !== undefined) {
      match = found
      break
    }
  }
  const entry: VisitorEntry = VISITOR_LINES[match.name]
  const line = fillLine(entry.text, match.values ?? {})
  const replay = at === undefined ? {} : { replay: at.replay }
  return { line, detail: messageOf(error), report: entry.report, ...replay }
}

const ENVIRONMENT_LINES: Readonly<Record<EnvironmentProblem['kind'], LineName>> = {
  insecure: 'insecure',
  isolation: 'isolation',
  // The module worker's line names the browsers that start one; it speaks to visitors already.
  workers: 'kept',
}

/** The line for what keeps the page from running, with the page's own `https:` address. */
export function environmentLine(
  problem: EnvironmentProblem,
  { host, pathname }: { readonly host: string; readonly pathname: string },
): VisitorLine {
  const entry: VisitorEntry = VISITOR_LINES[ENVIRONMENT_LINES[problem.kind]]
  const values = { address: `https://${host}${pathname}`, words: problem.detail }
  return { line: fillLine(entry.text, values), detail: problem.detail, report: entry.report }
}
