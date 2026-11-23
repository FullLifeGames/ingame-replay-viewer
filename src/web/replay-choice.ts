// The replay choice both pages share (#52): a test replay or a replay by link or ID turned into its
// stream and the summary of what the game does not show. The page lists the summary and Start
// plays the same stream, so both pages show the same counts. Each failure reaches the page as one
// line that names the step and keeps the module's own words.
import { messageOf } from './message'
import { replayJsonUrl } from './replay-input'
import type { TestReplay } from './replays'
import {
  notShown,
  notShownCounts,
  type NotShownCount,
  type NotShownRow,
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

function choose(json: unknown): Chosen {
  const { replay, stream } = streamOfReplay(json)
  const rows = notShown(replay, stream)
  const summary: ReplaySummary = {
    id: replay.id,
    streamBytes: stream.bytes.length,
    instructions: stream.instructions.length,
    rows,
    counts: notShownCounts(rows),
  }
  return { bytes: stream.bytes, summary }
}

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
    /** The newest pick that did not fail, for Start; it never rejects. */
    chosen: async (): Promise<Chosen | undefined> => replays.get(),
  }
}

export type ReplayChoice = ReturnType<typeof createReplayChoice>
