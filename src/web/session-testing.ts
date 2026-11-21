// Helpers for the session's specs: synthetic ROM bytes, a patch over them, and the page's world
// (its server, Showdown and the emulator) as fakes that log what the session asked of them.
import replay994052 from '../../test/fixtures/replays/smogtours-gen3ou-994052.json'
import replay994176 from '../../test/fixtures/replays/smogtours-gen3ou-994176.json'
import { createBps } from '../patch/bps-create'
import type { SlotDescription } from '../patch/slot'
import { type Emulator, EmulatorError, NOT_STARTED_LINE } from './emulator'
import { FetchError } from './fetch'
import { TEST_REPLAYS, type TestReplay } from './replays'
import { ROM_FILES } from './rom-files'
import { createSession, type Session, type SessionDeps } from './session'
import { sha1Hex } from './sha1'
import { streamOfReplay } from './stream'

// Synthetic bytes only: a 32 KiB "base ROM", and a "built ROM" with the IRV_SLOT magic at 0x100
// and a slot large enough for every test replay's stream.
export const BASE = Uint8Array.from({ length: 0x8000 }, (_, index) => (index * 31 + 7) & 0xff)
export const TARGET = new Uint8Array(BASE)
TARGET.set(new TextEncoder().encode('IRV_SLOT'), 0x100)
TARGET.fill(0, 0x108, 0x8000)
export const PATCH = createBps(BASE, TARGET)
const BASE_SHA1 = await sha1Hex(BASE)
export const OTHER_DUMP = new Uint8Array(BASE).fill(0, 0, 0x10)

export const DESCRIPTION: SlotDescription = {
  slotVersion: 1,
  magic: 'IRV_SLOT',
  offset: 0x100,
  size: 0x7f00,
  headerSize: 0x20,
  lengthOffset: 0x110,
  streamOffset: 0x120,
  capacity: 0x7ee0,
  romSha1: await sha1Hex(TARGET),
  romSize: TARGET.length,
}

export const SHOWDOWN_994176 = 'https://replay.pokemonshowdown.com/smogtours-gen3ou-994176.json'
export const MISSING = 'build/rom/irv-emerald.bps is missing: run npm run rom:build'

/** The page's world: its server, Showdown and the emulator, with a log of what the session did. */
export function world() {
  const answers = new Map<string, unknown>([
    [ROM_FILES.patch, PATCH],
    [ROM_FILES.slot, DESCRIPTION],
    [SHOWDOWN_994176, replay994176],
  ])
  const fetched: string[] = []
  const runs: Uint8Array[] = []
  const crashLines: string[] = []
  const log = { loads: 0, restarts: 0, refuseRun: false, refuseLoad: false }
  let crash: ((line: string) => void) | undefined
  const answer = (url: string): Promise<never> => {
    fetched.push(url)
    const value = answers.get(url) ?? new FetchError(`${url} answered 404`)
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value as never)
  }
  // Keeps the adapter's rules the session relies on: Restart refuses before a run.
  const emulator: Emulator = {
    run: (rom) => {
      if (log.refuseRun) throw new EmulatorError('The emulator did not accept the ROM.')
      runs.push(new Uint8Array(rom))
    },
    restart: () => {
      if (runs.length === 0) throw new EmulatorError(NOT_STARTED_LINE)
      log.restarts += 1
    },
    onCrash: (listener) => {
      crash = listener
    },
  }
  const deps: SessionDeps = {
    fetchBytes: answer,
    fetchJson: answer,
    loadEmulator: () => {
      log.loads += 1
      if (log.refuseLoad)
        return Promise.reject(new Error('WebAssembly.instantiate(): out of memory'))
      return Promise.resolve(emulator)
    },
    onCrash: (line) => crashLines.push(line),
    baseSha1: BASE_SHA1,
  }
  const crashNow = (line: string): void => crash?.(line)
  return { answers, fetched, runs, crashLines, log, crashNow, session: createSession(deps) }
}

const testReplay = (id: string): TestReplay => {
  const found = TEST_REPLAYS.find((replay) => replay.id === id)
  if (found === undefined) throw new Error(`no test replay ${id}`)
  return found
}
export const REPLAY_994052 = testReplay('smogtours-gen3ou-994052')
export const REPLAY_994086 = testReplay('smogtours-gen3ou-994086')
export const STREAM_994052 = streamOfReplay(replay994052).stream.bytes

/** The stream the slot of `rom` holds, by its length field. */
export function slotStream(rom: Uint8Array): Uint8Array {
  const length = new DataView(rom.buffer, rom.byteOffset).getUint32(DESCRIPTION.lengthOffset, true)
  return rom.slice(DESCRIPTION.streamOffset, DESCRIPTION.streamOffset + length)
}

export async function ready(session: Session): Promise<void> {
  await session.pickDump(BASE)
  await session.pickTestReplay(REPLAY_994052)
}
