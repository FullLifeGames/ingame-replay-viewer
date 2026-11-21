// The WebAssembly spike page in Chromium (#35, plan B5). It reads the user's US Emerald by the
// build's rule and skips without it or without the build outputs. It plays the hand-made battle
// at 1x and 994052 at fast, reads the run's status through the page's test hook, and checks the
// tick rule's pace at 1x and 2x. The game's sound plays at 1x and 2x and stays silent at fast; the
// test counts the samples that pass the audio ring and measures their loudness. The frames and
// the sound come from the dump, so only numbers leave the test.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loadBuildConfig } from '../scripts/rom-config.ts'
import { OUTPUT_NAMES } from '../scripts/rom-outputs.ts'
import { buildPaths, REPO_DIR } from '../scripts/rom-paths.ts'
import { readPreflightInput } from '../scripts/rom-preflight.ts'
import { PROGRESS_HEADER_PATH, readProgressLayout } from '../scripts/rom-shot-run.ts'
import { planStreams } from '../scripts/rom-shot.ts'
import { wasmPaths } from '../scripts/wasm-compile.ts'
import { LINK_OUTPUTS } from '../scripts/wasm-link.ts'
import { WASM_OUTPUT_NAMES } from '../scripts/wasm-outputs.ts'
import { MIXER_RATE } from '../src/web/wasm/protocol.ts'
import { frame } from './frames.ts'

const FIRST = 'smogtours-gen3ou-994052'
const HAND_MADE = 'hand-made'
const GBA_FRAMES_PER_SECOND = 59.7275
const DUMP = readPreflightInput(process.env, loadBuildConfig().baseRom.sha1).baseRomPath
const NEEDED = [
  join(wasmPaths(REPO_DIR).out, LINK_OUTPUTS.js),
  join(wasmPaths(REPO_DIR).out, WASM_OUTPUT_NAMES.patch),
  join(buildPaths().outDir, OUTPUT_NAMES.slot),
]

/** The run's sound: samples through the ring, left and right counted apart. */
interface Sound {
  written: number
  read: number
  overruns: number
  rms: number
  rate: number
  state: string
}

interface Status {
  audio: Sound
  frame: number
  finishedAt: number
  done: number
  total: number
  finished: boolean
  wallMs: number
  finishedMs: number | undefined
}

interface Hook {
  play(id: string, bytes: number[]): Promise<string>
  status(): Status | undefined
}

const status = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { irvWasmSpike: Hook }).irvWasmSpike.status())

async function finished(page: Page, timeout: number): Promise<Status> {
  await expect
    .poll(async () => (await status(page))?.finishedMs, { timeout, intervals: [1000] })
    .toBeGreaterThan(0)
  return (await status(page)) as Status
}

/**
 * Over `ms` of a running game: frames per second, and left and right pairs per second that went
 * into the audio ring and out to the worklet, each against the mixer's rate.
 */
async function rate(page: Page, ms: number) {
  const before = (await status(page)) as Status
  await page.waitForTimeout(ms)
  const after = (await status(page)) as Status
  const perSecond = (from: number, to: number) =>
    ((to - from) * 1000) / (after.wallMs - before.wallMs)
  const pairs = (from: number, to: number) => perSecond(from, to) / 2 / MIXER_RATE
  return {
    paced: perSecond(before.frame, after.frame),
    written: pairs(before.audio.written, after.audio.written),
    read: pairs(before.audio.read, after.audio.read),
    rms: after.audio.rms,
    sound: after.audio,
  }
}

const report = (numbers: Record<string, number | string>) => {
  process.stdout.write(`wasm-spike: ${JSON.stringify(numbers)}\n`)
}

async function handMadeBytes(): Promise<number[]> {
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const [plan] = await planStreams([HAND_MADE], layout)
  return [...(plan?.stream ?? [])]
}

// The hand-made battle at 1x through the test hook: the tick rule's pace, the sound's pace into
// the ring and out to the worklet, its loudness during the battle's music, and END.
async function playHandMade(page: Page, bytes: number[]): Promise<void> {
  await page.evaluate(
    async ([id, stream]) =>
      (globalThis as unknown as { irvWasmSpike: Hook }).irvWasmSpike.play(id, stream),
    [HAND_MADE, bytes] as const,
  )
  await page.waitForTimeout(2_000)
  const { paced, written, read, rms, sound } = await rate(page, 5_000)
  expect((await frame(page)).colours).toBeGreaterThan(1)
  const end = await finished(page, 240_000)
  const seconds = (end.finishedMs ?? 0) / 1000
  report({ stream: HAND_MADE, speed: '1x', toEnd: end.finishedAt, seconds, paced })
  const { overruns, state } = sound
  report({ stream: HAND_MADE, speed: '1x', written, read, rms, overruns, state, rate: sound.rate })
  expect(end.done).toBe(end.total)
  expect(paced / GBA_FRAMES_PER_SECOND).toBeGreaterThan(0.95)
  expect(paced / GBA_FRAMES_PER_SECOND).toBeLessThan(1.05)
  expect(state).toBe('running')
  for (const pace of [written, read]) {
    expect(pace).toBeGreaterThan(0.95)
    expect(pace).toBeLessThan(1.05)
  }
  expect(rms).toBeGreaterThan(0)
}

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

test('the spike page plays the hand-made battle at 1x and 994052 at fast', async ({ page }) => {
  const missing = [DUMP, ...NEEDED].filter((path) => !existsSync(path))
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run npm run rom:build and npm run wasm:build -- --link, or set IRV_BASE_ROM`,
  )
  test.setTimeout(900_000)
  // The test hook starts the hand-made battle without a click, so the page may open its audio.
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const handMade = await handMadeBytes()

  await page.goto('/wasm.html')
  expect(await page.evaluate('[isSecureContext, crossOriginIsolated]')).toEqual([true, true])
  const line = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(/built the module/, { timeout: 180_000 })

  await test.step('the hand-made battle reaches END at 1x, with its sound', async () => {
    await playHandMade(page, handMade)
  })

  await test.step('Restart at 2x plays twice as fast', async () => {
    await page.getByLabel('2x').check()
    await page.getByRole('button', { name: 'Restart' }).click()
    await expect(line).toHaveText(new RegExp(`^Running ${HAND_MADE}`))
    await page.waitForTimeout(2_000)
    const { paced, written, read, rms } = await rate(page, 5_000)
    report({ stream: HAND_MADE, speed: '2x', paced, written, read, rms })
    expect(paced / GBA_FRAMES_PER_SECOND).toBeGreaterThan(1.9)
    expect(paced / GBA_FRAMES_PER_SECOND).toBeLessThan(2.1)
    // Double pace: every other pair of twice the frames, so the ring fills as fast as at 1x.
    expect(written).toBeGreaterThan(0.95)
    expect(written).toBeLessThan(1.05)
    expect(rms).toBeGreaterThan(0)
  })

  await test.step('994052 reaches END at fast', async () => {
    await page.getByLabel('Fast').check()
    await expect(page.getByLabel('Test replay')).toHaveValue(FIRST)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(line).toHaveText(new RegExp(`^Running ${FIRST}`))
    const end = await finished(page, 600_000)
    const seconds = (end.finishedMs ?? 0) / 1000
    const fps = Math.round(end.finishedAt / seconds)
    report({ stream: FIRST, speed: 'fast', toEnd: end.finishedAt, seconds, fps })
    expect(end.done).toBe(end.total)
    expect(end.audio.written).toBe(0)
  })

  expect(errors).toEqual([])
})
