// The replay choice both pages share (#52): a test replay, a replay by link or ID, or a saved
// replay file (#56) turned into its stream and the summary of what the game does not show. The page lists the summary and Start
// plays the same stream, so both pages show the same counts. Each failure reaches the page as one
// line that names the step and keeps the module's own words.
import type { Replay } from '../script/replay'
import { readSavedReplay } from '../script/saved-replay'
import type { Side } from '../script/types'
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

/** A step of the flow that failed; `cause` holds the module's own error. */
export class SessionError extends Error {
  override name = 'SessionError'
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
}

/** A picked replay: the stream Start plays, and the summary the page lists. */
export interface Chosen {
  readonly bytes: Uint8Array
  readonly summary: ReplaySummary
}

export const failed = (step: string, error: unknown): SessionError =>
  new SessionError(`${step}: ${messageOf(error)}`, { cause: error })

/** Runs one step of the flow; its failure becomes "<step>: <the module's message>". */
export async function step<T>(name: string, work: () => T | Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw failed(name, error)
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

function chosenOf({ replay, stream, players }: ReplayStream): Chosen {
  const rows = notShown(replay, stream)
  const summary: ReplaySummary = {
    id: replay.id,
    streamBytes: stream.bytes.length,
    instructions: stream.instructions.length,
    rows,
    counts: notShownCounts(rows),
    players,
  }
  return { bytes: stream.bytes, summary }
}

const choose = (json: unknown): Chosen => chosenOf(streamOfReplay(json))
const chooseReplay = (replay: Replay): Chosen => chosenOf(streamOfLoaded(replay))

const STREAM_STEP = 'Could not turn the replay into a stream'

async function chooseTestReplay(replay: TestReplay): Promise<Chosen> {
  const json = await step(`Could not load the test replay ${replay.id}`, replay.load)
  return step(STREAM_STEP, () => choose(json))
}

async function chooseShowdownReplay(
  fetchJson: (url: string) => Promise<unknown>,
  input: string,
): Promise<Chosen> {
  const url = await step('Could not read the replay link', () => replayJsonUrl(input))
  const json = await step('Could not fetch the replay', () => fetchJson(url))
  return step(STREAM_STEP, () => choose(json))
}

/** A file the visitor picked, as the page's file input hands it on: `File` has these three. */
export interface SavedFile {
  readonly name: string
  /** In bytes. */
  readonly size: number
  text(): Promise<string>
}

const MB = 1024 * 1024
/** The largest replay file the viewer reads, in bytes: 5 MB. */
export const LARGEST_FILE = 5 * MB

/** A replay file over `LARGEST_FILE`, refused by its size before the page reads it. */
export class FileSizeError extends Error {
  override name = 'FileSizeError'
  /** The file's size in bytes. */
  readonly size: number

  constructor(fileName: string, size: number) {
    const holds = (Math.ceil((size / MB) * 10) / 10).toFixed(1)
    super(
      `${fileName} holds ${holds} MB, and the viewer reads replay files up to ${String(LARGEST_FILE / MB)} MB`,
    )
    this.size = size
  }
}

async function readFile(file: SavedFile): Promise<Replay> {
  if (file.size > LARGEST_FILE) throw new FileSizeError(file.name, file.size)
  return readSavedReplay(await file.text(), file.name)
}

async function chooseFile(file: SavedFile): Promise<Chosen> {
  const replay = await step(`Could not read the replay file ${file.name}`, () => readFile(file))
  return step(STREAM_STEP, () => chooseReplay(replay))
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
