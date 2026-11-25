// The Gen 5 spike page seen from a run (#72): the calls into its `window.gen5` hook through
// Playwright, the frames it saves under build/gen5/frames/ (gitignored, ADR 0002) and the log.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { UNPACK_REPORT, type UnpackGlobal, type UnpackReport } from '../src/gen5/core-unpack.ts'
import { type Gen5Global, RETRO_START } from '../src/gen5/hook.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { loadAverage, sampleMemory } from './gen5-proc.ts'

const START_TIMEOUT_MS = 5 * 60_000

/** How long a scripted button press is held; long enough for a few frames at low speed. */
const PRESS_MS = 400

export const log = (line: string) => {
  process.stdout.write(`${line}\n`)
}

export const sampleLine = () => {
  const m = sampleMemory()
  return `memory: ${String(m.processes)} processes, RSS ${String(m.rssMb)} MB, PSS ${String(m.pssMb)} MB, largest ${String(m.largestRssMb)} MB; load ${loadAverage()}`
}

export const framesOf = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.frames())

/** Waits until the core's frame counter reaches `frame`. */
export async function waitForFrame(page: Page, frame: number): Promise<void> {
  await page.waitForFunction(
    (target) => (globalThis as unknown as Gen5Global).gen5.frames() >= target,
    frame,
    { timeout: START_TIMEOUT_MS, polling: 250 },
  )
}

export async function saveFrame(page: Page, name: string): Promise<void> {
  const core = await Promise.race([
    page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.screenshot()),
    new Promise<string>((resolve) =>
      setTimeout(() => {
        resolve('')
      }, 10_000),
    ),
  ])
  const path = join(GEN5_PATHS.frames, `${name}.png`)
  if (core !== '') {
    writeFileSync(path, Buffer.from(core, 'base64'))
    log(`frame ${path} (core screenshot)`)
    return
  }
  await page.locator('#game canvas').first().screenshot({ path })
  log(`frame ${path} (page screenshot; the core gave none in 10 s)`)
}

export async function waitForStart(page: Page): Promise<void> {
  const begin = Date.now()
  await page.waitForFunction(
    () => {
      const hook = (globalThis as unknown as Gen5Global).gen5
      return hook.started() && hook.frames() > 0
    },
    null,
    { timeout: START_TIMEOUT_MS, polling: 1000 },
  )
  log(`started after ${((Date.now() - begin) / 1000).toFixed(1)} s; ${sampleLine()}`)
  await logUnpack(page)
}

/** Logs the report the page's unpacker keeps on its worker's global scope (src/web/gen5/
 * extract7z.ts): the files, their bytes and the ms the core took to unpack. */
export async function logUnpack(page: Page): Promise<void> {
  for (const worker of page.workers()) {
    const report = await worker
      .evaluate<UnpackReport | undefined, typeof UNPACK_REPORT>(
        (key) => (globalThis as UnpackGlobal)[key],
        UNPACK_REPORT,
      )
      .catch(() => undefined)
    if (report === undefined) continue
    log(
      `unpacked the core in the page's worker: ${String(report.files)} files, ${String(report.bytes)} bytes, ${report.ms.toFixed(0)} ms`,
    )
    return
  }
  log("unpacked the core: no worker holds the page's unpack report")
}

export async function pressStart(page: Page, frame: number): Promise<void> {
  await page.evaluate(
    ([button, ms]) => {
      ;(globalThis as unknown as Gen5Global).gen5.press(button, ms)
    },
    [RETRO_START, PRESS_MS] as const,
  )
  log(`pressed Start at frame ${String(frame)}`)
}

/** Logs the game's save as the core holds it (#78): the path the core reports, the save folder's
 * file system, and the file's size and SHA-256 once the core wrote one. */
export async function logSave(page: Page, when: string): Promise<void> {
  const save = await page.evaluate(() => (globalThis as unknown as Gen5Global).gen5.takeSave())
  if (save === undefined) {
    log(`save ${when}: the game is not running`)
    return
  }
  const file = save.file
    ? `${String(save.file.bytes)} bytes, SHA-256 ${save.file.sha256}`
    : 'no file yet'
  log(`save ${when}: path ${save.path}, folder on ${save.mount}, ${file}`)
}
