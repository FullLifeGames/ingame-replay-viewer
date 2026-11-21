// The page's flow (plan S5b §4) without the DOM: the user's dump patched into the built ROM, the
// picked replay turned into its stream, and Start writing the stream into the slot and running the
// emulator. The session holds the patched ROM, the slot description and the stream in memory
// only; it composes the page's modules, and each failure reaches the page as one line that names
// the step and keeps the module's own words.
import { type SlotDescription, writeReplaySlot } from '../patch/slot'
import { type Emulator, EmulatorError, NOT_STARTED_LINE } from './emulator'
import { messageOf } from './message'
import { replayJsonUrl } from './replay-input'
import type { TestReplay } from './replays'
import { checkBaseRom, patchBaseRom, readSlotDescription } from './rom'
import { ROM_FILES } from './rom-files'
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

/** What the page hands the session: its GETs, the emulator's loader and the crash line's sink. */
export interface SessionDeps {
  /** A same-origin GET of a build output, as `fetchBytes` in fetch.ts. */
  readonly fetchBytes: (url: string) => Promise<Uint8Array>
  /** A GET of replay-slot.json or of a replay JSON on Showdown, as `fetchJson` in fetch.ts. */
  readonly fetchJson: (url: string) => Promise<unknown>
  /** Called at the first Start, and again only after it failed. */
  readonly loadEmulator: () => Promise<Emulator>
  readonly onCrash: (line: string) => void
  /** The dump's SHA1 the patch needs; rom/gen3/build.json's when absent. */
  readonly baseSha1?: string
}

export interface DumpSummary {
  /** The patched ROM's SHA1, which replay-slot.json names. */
  readonly romSha1: string
}

export interface ReplaySummary {
  readonly id: string
  readonly streamBytes: number
  readonly instructions: number
  /** What the game does not show, by line. */
  readonly rows: readonly NotShownRow[]
  readonly counts: readonly NotShownCount[]
}

export interface StartSummary {
  readonly id: string
  readonly romSha1: string
  readonly streamBytes: number
}

/**
 * The page's actions. A pick resolves to `undefined` when a newer pick of its kind replaced it,
 * and the newest pick of each kind is what the next Start runs.
 */
export interface Session {
  pickDump(bytes: Uint8Array): Promise<DumpSummary | undefined>
  pickTestReplay(replay: TestReplay): Promise<ReplaySummary | undefined>
  /** A replay ID or a link to replay.pokemonshowdown.com. */
  loadReplay(input: string): Promise<ReplaySummary | undefined>
  start(): Promise<StartSummary>
  restart(): void
}

const PICK_DUMP = 'Pick your US Emerald dump first, then press Start.'
const PICK_REPLAY = 'Pick a replay first, then press Start.'

const failed = (step: string, error: unknown): SessionError =>
  new SessionError(`${step}: ${messageOf(error)}`, { cause: error })

/** Runs one step of the flow; its failure becomes "<step>: <the module's message>". */
async function step<T>(name: string, work: () => T | Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw failed(name, error)
  }
}

/** `make`'s promise, made at the first call and made again after it failed. */
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    pending ??= make().catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
}

/** The newest pick of one kind; an older pick that settles later counts for nothing. */
function newest<T>() {
  let current: Promise<T> | undefined
  return {
    get: () => current,
    pick: async (work: Promise<T>): Promise<T | undefined> => {
      current = work
      try {
        const value = await work
        return current === work ? value : undefined
      } catch (error) {
        if (current === work) throw error
        return undefined
      }
    },
  }
}

interface Dump {
  readonly rom: Uint8Array
  readonly description: SlotDescription
}

interface Chosen {
  readonly bytes: Uint8Array
  readonly summary: ReplaySummary
}

async function fetchBuildFiles(deps: SessionDeps) {
  const [patch, json] = await Promise.all([
    step('Could not fetch the patch', () => deps.fetchBytes(ROM_FILES.patch)),
    step('Could not fetch replay-slot.json', () => deps.fetchJson(ROM_FILES.slot)),
  ])
  const description = await step('Could not read replay-slot.json', () => readSlotDescription(json))
  return { patch, description }
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
const PATCH_STEP = 'Could not patch your dump'

async function chooseTestReplay(replay: TestReplay): Promise<Chosen> {
  const json = await step(`Could not load the test replay ${replay.id}`, replay.load)
  return step(STREAM_STEP, () => choose(json))
}

async function chooseShowdownReplay(deps: SessionDeps, input: string): Promise<Chosen> {
  const url = await step('Could not read the replay link', () => replayJsonUrl(input))
  const json = await step('Could not fetch the replay', () => deps.fetchJson(url))
  return step(STREAM_STEP, () => choose(json))
}

export function createSession(deps: SessionDeps): Session {
  const buildFiles = once(() => fetchBuildFiles(deps))
  const dumps = newest<Dump>()
  const replays = newest<Chosen>()
  let loaded: Emulator | undefined
  const emulator = once(async () => {
    const ready = await step('Could not start the emulator', deps.loadEmulator)
    ready.onCrash(deps.onCrash)
    loaded = ready
    return ready
  })

  const patched = async (bytes: Uint8Array): Promise<Dump> => {
    await step(PATCH_STEP, () => checkBaseRom(bytes, deps.baseSha1))
    const { patch, description } = await buildFiles()
    const rom = await step(PATCH_STEP, () => patchBaseRom(bytes, patch, description))
    return { rom, description }
  }
  const summaryOf = async (pick: Promise<Chosen | undefined>) => (await pick)?.summary

  const start = async (): Promise<StartSummary> => {
    const [dumpPick, replayPick] = [dumps.get(), replays.get()]
    if (dumpPick === undefined) throw new SessionError(PICK_DUMP)
    if (replayPick === undefined) throw new SessionError(PICK_REPLAY)
    const [dump, chosen] = await Promise.all([dumpPick, replayPick])
    const rom = await step('Could not write the replay into the ROM', () =>
      writeReplaySlot(dump.rom, dump.description, chosen.bytes),
    )
    const running = await emulator()
    await step('Could not start the emulator', () => {
      running.run(rom)
    })
    const { id, streamBytes } = chosen.summary
    return { id, romSha1: dump.description.romSha1, streamBytes }
  }

  return {
    pickDump: async (bytes) => {
      const dump = await dumps.pick(patched(bytes))
      return dump === undefined ? undefined : { romSha1: dump.description.romSha1 }
    },
    pickTestReplay: (replay) => summaryOf(replays.pick(chooseTestReplay(replay))),
    loadReplay: (input) => summaryOf(replays.pick(chooseShowdownReplay(deps, input))),
    start,
    restart: () => {
      try {
        if (loaded === undefined) throw new EmulatorError(NOT_STARTED_LINE)
        loaded.restart()
      } catch (error) {
        throw failed('Could not restart', error)
      }
    },
  }
}
