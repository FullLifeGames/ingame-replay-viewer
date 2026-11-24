// The S2 scene of a Gen 5 spike run (#72): find DS main RAM in the core's heap, write a word on
// the title screen and read it back after 60 frames, measure the speed at 1x and uncapped in the opening and on the
// title screen, profile where the time goes, and find main RAM again after more than a minute.
// The S2b scene "pacing" measures the title screen at 1x with vsync off, with fast-forward held
// at a ratio of 1.0, and uncapped.
// Main RAM's bytes never leave the page: the log holds heap offsets, the game code and the one
// word written.
import type { Page } from '@playwright/test'

import type { Gen5Global, MainRamReport } from '../src/gen5/hook.ts'
import { paceBetween, paceLine, type PaceSample, paceWindows } from '../src/gen5/pace.ts'
import { framesOf, log, pressStart, sampleLine, saveFrame, waitForFrame } from './gen5-page.ts'
import { loadAverage } from './gen5-proc.ts'
import { profileFor } from './gen5-profile.ts'

const WINDOW_S = 30
const PROFILE_S = 10
const WRITE_FRAMES = 60
const QUIET_TRIES = 3
/** A word no game state is likely to hold: "GEN5" in ASCII. */
const PROOF_VALUE = 0x47454e35
/** Frames after the Start press before the title screen stands. */
const TITLE_SETTLE_FRAMES = 300

const hex = (value: number) => `0x${value.toString(16).toUpperCase()}`

function reportLine(label: string, report: MainRamReport): string {
  const hits = report.headerHits.map(hex).join(' ')
  const bases = report.bases.map(hex).join(' ')
  return `main RAM ${label}: base ${report.base < 0 ? 'none' : hex(report.base)}, candidates [${bases}], game code "${report.gameCode}", heap ${String(report.heapBytes)} bytes, header hits [${hits}], scan ${String(report.scanMs)} ms`
}

async function findMainRam(page: Page, label: string): Promise<MainRamReport> {
  const report = await page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.findMainRam())
  log(reportLine(label, report))
  return report
}

const readWord = (page: Page, address: number) =>
  page.evaluate((at) => (globalThis as unknown as Gen5Global).gen5.readWord(at), address)

const writeWord = (page: Page, address: number, value: number) =>
  page.evaluate(
    ([at, word]) => {
      ;(globalThis as unknown as Gen5Global).gen5.writeWord(at, word)
    },
    [address, value] as const,
  )

const quietWord = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.quietWord())

/** A zero word that stayed zero over WRITE_FRAMES frames, or -1 after QUIET_TRIES picks. */
async function stillWord(page: Page): Promise<number> {
  for (let tries = 0; tries < QUIET_TRIES; tries += 1) {
    const address = await quietWord(page)
    await waitForFrame(page, (await framesOf(page)) + WRITE_FRAMES)
    const value = await readWord(page, address)
    log(`quiet word ${hex(address)} after ${String(WRITE_FRAMES)} frames: ${hex(value)}`)
    if (value === 0) return address
  }
  return -1
}

async function writeProof(page: Page, core: string): Promise<void> {
  const address = await stillWord(page)
  if (address < 0) {
    log(`write proof: no word stayed zero over ${String(WRITE_FRAMES)} frames`)
    return
  }
  await writeWord(page, address, PROOF_VALUE)
  const frame = await framesOf(page)
  await waitForFrame(page, frame + WRITE_FRAMES)
  const after = await readWord(page, address)
  const later = await framesOf(page)
  log(
    `write proof at ${hex(address)}: wrote ${hex(PROOF_VALUE)} at frame ${String(frame)}, read ${hex(after)} at frame ${String(later)}: ${after === PROOF_VALUE ? 'held' : 'LOST'}`,
  )
  await saveFrame(page, `s2-${core}-write`)
  await writeWord(page, address, 0)
}

const setUncapped = (page: Page, on: boolean) =>
  page.evaluate((value) => {
    ;(globalThis as unknown as Gen5Global).gen5.uncapped(value)
  }, on)

/** Samples the frame counter once a second for WINDOW_S and logs the rate with the load. */
async function measureWindow(page: Page, label: string): Promise<void> {
  const loadBefore = loadAverage()
  const samples: PaceSample[] = []
  const begin = Date.now()
  for (let second = 0; second <= WINDOW_S; second += 1) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, begin + second * 1000 - Date.now())),
    )
    samples.push({ ms: Date.now(), frame: await framesOf(page) })
  }
  const first = samples[0]
  const last = samples.at(-1)
  if (!first || !last) return
  const windows = paceWindows(samples, 10_000).map((pace) => pace.fps.toFixed(1))
  log(
    `speed ${label}: ${paceLine(paceBetween(first, last))}; 10 s windows ${windows.join(' ')}; load before ${loadBefore}, after ${loadAverage()}`,
  )
}

/** One window at 1x or uncapped; the cap is back on after it. */
async function speedWindow(page: Page, label: string, uncapped: boolean): Promise<void> {
  await setUncapped(page, uncapped)
  await measureWindow(page, label)
  await setUncapped(page, false)
}

async function profile(page: Page, label: string): Promise<void> {
  log(`profile ${label}, ${String(PROFILE_S)} s at 1x, frame ${String(await framesOf(page))}:`)
  for (const line of await profileFor(page, PROFILE_S)) log(line)
}

async function reachTitle(page: Page, startAtFrame: number): Promise<void> {
  await waitForFrame(page, startAtFrame)
  const frame = await framesOf(page)
  await pressStart(page, frame)
  await waitForFrame(page, frame + TITLE_SETTLE_FRAMES)
  log(`title at frame ${String(await framesOf(page))}; ${sampleLine()}`)
}

export async function speedScene(page: Page, core: string, startAtFrame: number): Promise<void> {
  const firstAt = Date.now()
  const first = await findMainRam(page, 'at start')
  await speedWindow(page, `${core} opening 1x`, false)
  await speedWindow(page, `${core} opening uncapped`, true)
  await profile(page, `${core} opening`)
  await reachTitle(page, startAtFrame)
  await saveFrame(page, `s2-${core}-title`)
  if (first.base >= 0) await writeProof(page, core)
  await speedWindow(page, `${core} title 1x`, false)
  await speedWindow(page, `${core} title uncapped`, true)
  await profile(page, `${core} title`)
  const again = await findMainRam(
    page,
    `after ${String(Math.round((Date.now() - firstAt) / 1000))} s`,
  )
  log(`main RAM base ${again.base === first.base && first.base >= 0 ? 'held' : 'MOVED OR MISSING'}`)
}

const setFastForward = (page: Page, ratio: number | undefined) =>
  page.evaluate((value) => {
    ;(globalThis as unknown as Gen5Global).gen5.fastForward(value ?? undefined)
  }, ratio ?? null)

/** S2b: the title screen at 1x with the page's default (vsync off), with fast-forward held at a
 * ratio of 1.0 (RetroArch's frame limiter at 1x, no vsync and no audio blocking), and uncapped,
 * one after the other in one run, so the three share the machine's load. */
export async function pacingScene(page: Page, core: string, startAtFrame: number): Promise<void> {
  await reachTitle(page, startAtFrame)
  await saveFrame(page, `s2b-${core}-pacing-title`)
  await measureWindow(page, `${core} title 1x, vsync off`)
  await setFastForward(page, 1)
  await measureWindow(page, `${core} title fast-forward at ratio 1.0`)
  await setFastForward(page, undefined)
  await speedWindow(page, `${core} title uncapped`, true)
}
