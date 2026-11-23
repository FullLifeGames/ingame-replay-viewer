// The WebAssembly page's test hook for the e2e: the module's build outputs and the dump the page
// needs, the run's status through `irvWasmSpike`, its pace and sound over a stretch of wall time
// against the tick rule, and the report line. Only numbers leave this module; the frames and the
// sound stay in the page.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page } from '@playwright/test'

import { loadBuildConfig } from '../scripts/rom-config.ts'
import { OUTPUT_NAMES } from '../scripts/rom-outputs.ts'
import { buildPaths, REPO_DIR } from '../scripts/rom-paths.ts'
import { readPreflightInput } from '../scripts/rom-preflight.ts'
import { PROGRESS_HEADER_PATH, readProgressLayout } from '../scripts/rom-shot-run.ts'
import { planStreams } from '../scripts/rom-shot.ts'
import { wasmPaths } from '../scripts/wasm-compile.ts'
import { LINK_OUTPUTS } from '../scripts/wasm-link.ts'
import { WASM_OUTPUT_NAMES } from '../scripts/wasm-outputs.ts'
import { GBA_FRAMES_PER_SECOND, MIXER_RATE } from '../src/web/wasm/protocol.ts'

/** The user's US Emerald, found by the build's rule. */
export const DUMP = readPreflightInput(process.env, loadBuildConfig().baseRom.sha1).baseRomPath
export const SLOT = join(buildPaths().outDir, OUTPUT_NAMES.slot)
const NEEDED = [
  join(wasmPaths(REPO_DIR).out, LINK_OUTPUTS.js),
  join(wasmPaths(REPO_DIR).out, WASM_OUTPUT_NAMES.patch),
  SLOT,
]

/** What the WebAssembly page needs to run a replay and is not there: the dump or a build output. */
export const missingForModule = (): string[] =>
  [DUMP, ...NEEDED].filter((path) => !existsSync(path))

/** The hand-made battle's id, as the shot tool plans it. */
export const HAND_MADE = 'hand-made'

/** The hand-made battle's instruction stream, which the test hook plays without a pick. */
export async function handMadeBytes(): Promise<number[]> {
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const [plan] = await planStreams([HAND_MADE], layout)
  return [...(plan?.stream ?? [])]
}

/** The run's sound: samples through the ring, left and right counted apart. */
interface Sound {
  written: number
  /** Read includes the samples the worklet skipped to hold its latency cap. */
  read: number
  writtenToEnd: number | undefined
  overruns: number
  skipped: number
  underruns: number
  rms: number
  rate: number | undefined
  state: string | undefined
  silence: string | undefined
}

interface Status {
  audio: Sound
  frame: number
  finishedAt: number
  done: number
  total: number
  /** The turn the game reached, 0 before turn 1. */
  turn: number
  finished: boolean
  /** Whether the viewer's Pause holds the run (#57). */
  paused: boolean
  speed: string
  wallMs: number
  finishedMs: number | undefined
  failure: string | undefined
  runs: { started: number; live: number }
}

interface Hook {
  play(id: string, bytes: number[]): Promise<string>
  status(): Status | undefined
}

export const status = (page: Page): Promise<Status | undefined> =>
  page.evaluate(() => (globalThis as unknown as { irvWasmSpike: Hook }).irvWasmSpike.status())

/** Starts the stream `bytes` under the replay id `id` through the hook, with no click. */
export async function playStream(page: Page, id: string, bytes: number[]): Promise<void> {
  await page.evaluate(
    async ([name, stream]) =>
      (globalThis as unknown as { irvWasmSpike: Hook }).irvWasmSpike.play(name, stream),
    [id, bytes] as const,
  )
}

/** Waits until the run's status passes `reached`; the game's failure line ends the wait at once. */
export async function waitFor(
  page: Page,
  reached: (now: Status) => boolean,
  timeout: number,
): Promise<Status> {
  await expect
    .poll(
      async () => {
        const now = await status(page)
        if (now === undefined) return undefined
        return now.failure ?? (reached(now) || undefined)
      },
      { timeout, intervals: [1000] },
    )
    .toBeDefined()
  const now = (await status(page)) as Status
  expect(now.failure).toBeUndefined()
  return now
}

// Waits for END, and stops at once when the game failed: its line, not a timeout, fails the test.
export const finished = (page: Page, timeout: number): Promise<Status> =>
  waitFor(page, (now) => (now.finishedMs ?? 0) > 0, timeout)

/**
 * Over `ms` of a running game: frames per second, and left and right pairs per second that went
 * into the audio ring and out to the worklet, each against the mixer's rate.
 */
export async function rate(page: Page, ms: number) {
  const before = (await status(page)) as Status
  await page.waitForTimeout(ms)
  const after = (await status(page)) as Status
  const perSecond = (from: number, to: number) =>
    ((to - from) * 1000) / (after.wallMs - before.wallMs)
  const pairs = (from: number, to: number) => perSecond(from, to) / 2 / MIXER_RATE
  const [from, to] = [before.audio, after.audio]
  return {
    paced: perSecond(before.frame, after.frame),
    written: pairs(from.written, to.written),
    read: pairs(from.read, to.read),
    played: pairs(from.read - from.skipped, to.read - to.skipped),
    rms: to.rms,
    sound: to,
  }
}

export const report = (numbers: Record<string, number | string>): void => {
  process.stdout.write(`wasm-spike: ${JSON.stringify(numbers)}\n`)
}

type Measured = Awaited<ReturnType<typeof rate>>

/**
 * The tick rule's pace at `factor` times the game's own, and the sound written into the ring at
 * the mixer's rate: at 2x the worker filters twice the frames and keeps one pair of each two, so
 * the ring fills as fast as at 1x.
 */
function expectPace({ paced, written, rms }: Measured, factor: number): void {
  expect(paced / GBA_FRAMES_PER_SECOND).toBeGreaterThan(factor * 0.95)
  expect(paced / GBA_FRAMES_PER_SECOND).toBeLessThan(factor * 1.05)
  expect(written).toBeGreaterThan(0.95)
  expect(written).toBeLessThan(1.05)
  expect(rms).toBeGreaterThan(0)
}

/** 2 s after a start or a switch, the next 5 s of `stream` against `factor`, reported as `speed`. */
export async function measure(
  page: Page,
  stream: string,
  speed: string,
  factor: number,
): Promise<Measured> {
  await page.waitForTimeout(2_000)
  const measured = await rate(page, 5_000)
  const { paced, written, read, played, rms } = measured
  report({ stream, speed, paced, written, read, played, rms })
  expectPace(measured, factor)
  return measured
}
