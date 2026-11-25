// The replay choice both pages share (#52): a test replay, a replay by link or ID, or a saved
// replay file (#56) turned into its stream and the summary of what the game does not show. The
// page lists the summary and Start plays the same stream, so both pages show the same counts. Each
// failure becomes a `SessionError` that names the step and keeps the module's own words, which
// the page shows under "Details" below the visitor line (#59).
import type { Replay } from '../script/replay'
import { readSavedFile, type SavedKind } from '../script/saved-replay'
import type { Preview, Side } from '../script/types'
import { messageOf } from './message'
import { replayJsonUrl } from './replay-input'
import type { TestReplay } from './replays'
import {
  notShown,
  notShownCounts,
  type NotShownCount,
  type NotShownRow,
  type ReplayStream,
  streamOfLoaded,
  streamOfReplay,
} from './stream'

/** Where a picked replay came from: the example list, a link or ID, or a saved file. */
export type ReplaySource = 'example' | 'link' | 'file'

/** A pick's source and the text a report names it by: the example's ID, the link as typed, the file's kind. */
export interface ReplayPlace {
  readonly source: ReplaySource
  readonly replay: string
}

/** A step of the flow that failed; `cause` holds the module's own error. */
export class SessionError extends Error {
  override name = 'SessionError'
  /** Where the replay of a failed pick came from; undefined outside a pick. */
  readonly source: ReplaySource | undefined
  /** The replay of a failed pick, as a report names it (`ReplayPlace`). */
  readonly replay: string | undefined

  constructor(message: string, options?: ErrorOptions, place?: ReplayPlace) {
    super(message, options)
    this.source = place?.source
    this.replay = place?.replay
  }
}

/** The Start refusals of both pages. */
export const PICK_DUMP = 'Pick your US Emerald dump first, then press Start.'
export const PICK_REPLAY = 'Pick a replay first, then press Start.'

export interface ReplaySummary {
  readonly id: string
  readonly streamBytes: number
  readonly instructions: number
  /** What the game does not show, by line. */
  readonly rows: readonly NotShownRow[]
  readonly counts: readonly NotShownCount[]
  /** The players by side, from the battle log, for the panel (#58). */
  readonly players: Readonly<Record<Side, string>>
  /** Both teams of Team Preview, for the team list (#87); absent for a log without it. */
  readonly preview?: Preview
}

/**
 * A picked replay: the stream Start plays, the summary the page lists, and where it came from, so
 * a run's failure reports the pick's place (S5-11).
 */
export interface Chosen {
  readonly bytes: Uint8Array
  readonly summary: ReplaySummary
  readonly place: ReplayPlace
}

export const failed = (step: string, error: unknown, place?: ReplayPlace): SessionError =>
  new SessionError(`${step}: ${messageOf(error)}`, { cause: error }, place)

/**
 * Runs one step of the flow; its failure becomes "<step>: <the module's message>", with the
 * pick's `place` when it has one.
 */
export async function step<T>(
  name: string,
  work: () => T | Promise<T>,
  place?: ReplayPlace,
): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw failed(name, error, place)
  }
}

/**
 * The newest pick of one kind; an older pick that settles later counts for nothing. With
 * `keepEarlier`, a pick that fails hands the next Start the last pick that settled while it was
 * the newest (the one the page shows), or `undefined`.
 */
export function newest<T>(keepEarlier: boolean) {
  let current: Promise<T | undefined> | undefined
  let shown: Promise<T | undefined> | undefined
  return {
    get: () => current,
    pick: async (work: Promise<T>): Promise<T | undefined> => {
      const held = keepEarlier ? work.catch(() => shown) : work
      current = held
      try {
        const value = await work
        if (current !== held) return undefined
        shown = held
        return value
      } catch (error) {
        if (current === held) throw error
        return undefined
      }
    },
  }
}

function chosenOf({ replay, stream, players, preview }: ReplayStream, place: ReplayPlace): Chosen {
  const rows = notShown(replay, stream)
  const summary: ReplaySummary = {
    id: replay.id,
    streamBytes: stream.bytes.length,
    instructions: stream.instructions.length,
    rows,
    counts: notShownCounts(rows),
    players,
    ...(preview === undefined ? {} : { preview }),
  }
  return { bytes: stream.bytes, summary, place }
}

const choose = (json: unknown, place: ReplayPlace): Chosen => chosenOf(streamOfReplay(json), place)
const chooseReplay = (replay: Replay, place: ReplayPlace): Chosen =>
  chosenOf(streamOfLoaded(replay), place)

const STREAM_STEP = 'Could not turn the replay into a stream'

/** The file of an example replay did not arrive, as when a phone drops the network. */
export class ExampleLoadError extends Error {
  override name = 'ExampleLoadError'
}

async function loadExample(replay: TestReplay): Promise<unknown> {
  try {
    return await replay.load()
  } catch (error) {
    throw new ExampleLoadError(messageOf(error), { cause: error })
  }
}

async function chooseTestReplay(replay: TestReplay): Promise<Chosen> {
  const place: ReplayPlace = { source: 'example', replay: replay.id }
  const load = `Could not load the example replay ${replay.id}`
  const json = await step(load, () => loadExample(replay), place)
  return step(STREAM_STEP, () => choose(json, place), place)
}

async function chooseShowdownReplay(
  fetchJson: (url: string) => Promise<unknown>,
  input: string,
): Promise<Chosen> {
  const place: ReplayPlace = { source: 'link', replay: input.trim() }
  const url = await step('Could not read the replay link', () => replayJsonUrl(input), place)
  const json = await step('Could not fetch the replay', () => fetchJson(url), place)
  return step(STREAM_STEP, () => choose(json, place), place)
}

/** A file the visitor picked, as the page's file input hands it on: `File` has these three. */
export interface SavedFile {
  readonly name: string
  /** In bytes. */
  readonly size: number
  text(): Promise<string>
}

const MB = 1024 * 1024
/** The largest replay file the viewer reads, in MB and in bytes. */
export const LARGEST_FILE_MB = 5
export const LARGEST_FILE = LARGEST_FILE_MB * MB

/** A replay file over `LARGEST_FILE`, refused by its size before the page reads it. */
export class FileSizeError extends Error {
  override name = 'FileSizeError'
  readonly fileName: string
  /** The file's size in bytes. */
  readonly size: number
  /** The size in MB, rounded up to one decimal, so a file just over the bound never reads "5.0". */
  readonly megabytes: string

  constructor(fileName: string, size: number) {
    const megabytes = (Math.ceil((size / MB) * 10) / 10).toFixed(1)
    super(
      `${fileName} holds ${megabytes} MB, and the viewer reads replay files up to ${String(LARGEST_FILE_MB)} MB`,
    )
    this.fileName = fileName
    this.size = size
    this.megabytes = megabytes
  }
}

/** How a report names a saved file: by its kind, never by its name. */
const KIND_NAMES: Readonly<Record<SavedKind, string>> = {
  downloaded: 'a replay saved with "Download replay"',
  page: 'a saved replay page',
  log: 'a battle log',
  json: "a replay's JSON file",
}
const NO_KIND = 'a file of no known kind'

async function readFile(file: SavedFile): Promise<string> {
  if (file.size > LARGEST_FILE) throw new FileSizeError(file.name, file.size)
  return file.text()
}

async function chooseFile(file: SavedFile): Promise<Chosen> {
  const read = `Could not read the replay file ${file.name}`
  const text = await step(read, () => readFile(file), { source: 'file', replay: NO_KIND })
  const saved = readSavedFile(text, file.name)
  const place: ReplayPlace = {
    source: 'file',
    replay: saved.kind === undefined ? NO_KIND : KIND_NAMES[saved.kind],
  }
  const replay = await step(read, saved.replay, place)
  return step(STREAM_STEP, () => chooseReplay(replay, place), place)
}

/**
 * The picks of a page. A pick resolves to `undefined` when a newer pick replaced it; one that
 * fails leaves the replay picked before it, which the page still shows and Start still plays.
 */
export function createReplayChoice(fetchJson: (url: string) => Promise<unknown>) {
  const replays = newest<Chosen>(true)
  const summaryOf = async (pick: Promise<Chosen | undefined>) => (await pick)?.summary
  return {
    pickTestReplay: (replay: TestReplay): Promise<ReplaySummary | undefined> =>
      summaryOf(replays.pick(chooseTestReplay(replay))),
    /** A replay ID or a link to replay.pokemonshowdown.com. */
    loadReplay: (input: string): Promise<ReplaySummary | undefined> =>
      summaryOf(replays.pick(chooseShowdownReplay(fetchJson, input))),
    /** A saved replay file: Showdown's download, a saved replay page, a battle log or JSON. */
    loadFile: (file: SavedFile): Promise<ReplaySummary | undefined> =>
      summaryOf(replays.pick(chooseFile(file))),
    /** The newest pick that did not fail, for Start; it never rejects. */
    chosen: async (): Promise<Chosen | undefined> => replays.get(),
  }
}

export type ReplayChoice = ReturnType<typeof createReplayChoice>
