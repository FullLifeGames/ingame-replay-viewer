// The page's flow (plan S5b §4) without the DOM: the user's dump patched into the built ROM, the
// picked replay turned into its stream, and Start writing the stream into the slot and running the
// emulator. The session holds the patched ROM, the slot description and the stream in memory
// only; it composes the page's modules, and each failure reaches the page as one line that names
// the step and keeps the module's own words.
import { type SlotDescription, writeReplaySlot } from '../patch/slot'
import { type Emulator, EmulatorError, NOT_STARTED_LINE } from './emulator'
import {
  createReplayChoice,
  failed,
  newest,
  PICK_DUMP,
  PICK_REPLAY,
  type ReplaySummary,
  SessionError,
  step,
} from './replay-choice'
import type { TestReplay } from './replays'
import { checkBaseRom, patchBaseRom, readSlotDescription } from './rom'
import { ROM_FILES } from './rom-files'
import type { PlayingGame } from './visitor'

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

interface StartSummary {
  readonly id: string
  /** The replay label the line names the replay by (#90). */
  readonly label: string
}

/**
 * The page's actions. A pick resolves to `undefined` when a newer pick of its kind replaced it,
 * and the newest pick of each kind is what the next Start runs. A replay pick that fails leaves
 * the replay picked before it, which the page still shows; a refused dump stays the dump pick,
 * so Start repeats its refusal while the file input shows that file.
 */
export interface Session {
  pickDump(bytes: Uint8Array): Promise<DumpSummary | undefined>
  pickTestReplay(replay: TestReplay): Promise<ReplaySummary | undefined>
  /** A replay ID or a link to replay.pokemonshowdown.com. */
  loadReplay(input: string): Promise<ReplaySummary | undefined>
  start(): Promise<StartSummary>
  restart(): void
  /**
   * The game the emulator runs, which a failed pick names (#69): the last Start's replay, until the
   * core crashed or a Start took the game down. The page cannot tell END in mGBA, so a game past
   * END still counts, and the game says so.
   */
  readonly playing: () => PlayingGame | undefined
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

interface Dump {
  readonly rom: Uint8Array
  readonly description: SlotDescription
}

async function fetchBuildFiles(deps: SessionDeps) {
  const [patch, json] = await Promise.all([
    step('Could not fetch the patch', () => deps.fetchBytes(ROM_FILES.patch)),
    step('Could not fetch replay-slot.json', () => deps.fetchJson(ROM_FILES.slot)),
  ])
  const description = await step('Could not read replay-slot.json', () => readSlotDescription(json))
  return { patch, description }
}

const PATCH_STEP = 'Could not patch your dump'

export function createSession(deps: SessionDeps): Session {
  const buildFiles = once(() => fetchBuildFiles(deps))
  const dumps = newest<Dump>(false)
  const replays = createReplayChoice(deps.fetchJson)
  let loaded: Emulator | undefined
  let playing: string | undefined
  const emulator = once(async () => {
    const ready = await step('Could not start the emulator', deps.loadEmulator)
    ready.onCrash((line) => {
      playing = undefined
      deps.onCrash(line)
    })
    loaded = ready
    return ready
  })

  const patched = async (bytes: Uint8Array): Promise<Dump> => {
    await step(PATCH_STEP, () => checkBaseRom(bytes, deps.baseSha1))
    const { patch, description } = await buildFiles()
    const rom = await step(PATCH_STEP, () => patchBaseRom(bytes, patch, description))
    return { rom, description }
  }

  const start = async (): Promise<StartSummary> => {
    const [dump, chosen] = await Promise.all([dumps.get(), replays.chosen()])
    if (dump === undefined) throw new SessionError(PICK_DUMP)
    if (chosen === undefined) throw new SessionError(PICK_REPLAY)
    const rom = await step('Could not write the replay into the ROM', () =>
      writeReplaySlot(dump.rom, dump.description, chosen.bytes),
    )
    const running = await emulator()
    // The emulator quits the game it runs before it loads the ROM, which it may refuse.
    playing = undefined
    await step('Could not start the emulator', () => {
      running.run(rom)
    })
    const { id, label } = chosen.summary
    playing = label
    return { id, label }
  }

  return {
    pickDump: async (bytes) => {
      const dump = await dumps.pick(patched(bytes))
      return dump === undefined ? undefined : { romSha1: dump.description.romSha1 }
    },
    pickTestReplay: replays.pickTestReplay,
    loadReplay: replays.loadReplay,
    start,
    playing: () => (playing === undefined ? undefined : { replay: playing, tellsEnd: false }),
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
