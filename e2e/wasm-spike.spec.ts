// The WebAssembly spike page in Chromium (#35, plan B5). It reads the user's US Emerald by the
// build's rule and skips without it or without the build outputs. It plays the hand-made battle
// at 1x and 994052 at fast, reads the run's status through the page's test hook, and checks the
// tick rule's pace at 1x and 2x. The game's sound plays at 1x and 2x and stays silent at fast; the
// test counts the samples that pass the audio ring and measures their loudness. Two Start presses
// during the build start one run, and at END the page leaves fast for 1x. A second test
// measures mGBA on the emulator page at fast-forward, for the write-up's speed comparison (B7).
// The frames and the sound come from the dump, so only numbers leave the tests.
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
import { LINK_OUTPUTS, WASM_BUILD_STEPS } from '../scripts/wasm-link.ts'
import { WASM_OUTPUT_NAMES } from '../scripts/wasm-outputs.ts'
import { GBA_FRAMES_PER_SECOND, MIXER_RATE } from '../src/web/wasm/protocol.ts'
import { frame } from './frames.ts'

const FIRST = 'smogtours-gen3ou-994052'
const HAND_MADE = 'hand-made'
const DUMP = readPreflightInput(process.env, loadBuildConfig().baseRom.sha1).baseRomPath
const ROM_PATCH = join(buildPaths().outDir, OUTPUT_NAMES.patch)
const SLOT = join(buildPaths().outDir, OUTPUT_NAMES.slot)
const NEEDED = [
  join(wasmPaths(REPO_DIR).out, LINK_OUTPUTS.js),
  join(wasmPaths(REPO_DIR).out, WASM_OUTPUT_NAMES.patch),
  SLOT,
]
/** mGBA's fast-forward multipliers the probe runs 994052 at, one window each. */
const MULTIPLIERS = [1, 16, 64, 256]
const WINDOW_MS = 10_000
// The emulator page keeps mGBA's module to itself. The probe wraps the package's default export
// as the browser loads it, so the test reaches the module the page made; the page stays as it is.
const EXPOSE_CORE =
  'const irvExposeCore=async(options)=>{const core=await mGBA(options);' +
  'globalThis.irvMgbaCore=core;return core};export default irvExposeCore;'

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
  finished: boolean
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

const status = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { irvWasmSpike: Hook }).irvWasmSpike.status())

// Waits for END, and stops at once when the game failed: its line, not a timeout, fails the test.
async function finished(page: Page, timeout: number): Promise<Status> {
  await expect
    .poll(
      async () => {
        const now = await status(page)
        return now?.failure ?? ((now?.finishedMs ?? 0) > 0 || undefined)
      },
      { timeout, intervals: [1000] },
    )
    .toBeDefined()
  const end = (await status(page)) as Status
  expect(end.failure).toBeUndefined()
  return end
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
  const { paced, written, read, played, rms, sound } = await rate(page, 5_000)
  expect((await frame(page)).colours).toBeGreaterThan(1)
  const end = await finished(page, 240_000)
  const seconds = (end.finishedMs ?? 0) / 1000
  report({ stream: HAND_MADE, speed: '1x', toEnd: end.finishedAt, seconds, paced })
  const { overruns, skipped, underruns, state } = end.audio
  report({ stream: HAND_MADE, speed: '1x', written, read, played, rms, state: state ?? '-' })
  report({ stream: HAND_MADE, speed: '1x', overruns, skipped, underruns, rate: sound.rate ?? 0 })
  expect(end.done).toBe(end.total)
  expect(paced / GBA_FRAMES_PER_SECOND).toBeGreaterThan(0.95)
  expect(paced / GBA_FRAMES_PER_SECOND).toBeLessThan(1.05)
  expect(sound.silence).toBeUndefined()
  expect(state).toBe('running')
  // The worker's pace is the page's; the worklet's follows the audio clock of headless Chromium,
  // so its numbers are reported, and only a stalled or far slower read fails the test.
  expect(written).toBeGreaterThan(0.95)
  expect(written).toBeLessThan(1.05)
  expect(read).toBeGreaterThan(0)
  expect(read).toBeGreaterThanOrEqual(0.9 * written)
  expect(rms).toBeGreaterThan(0)
}

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

test('the spike page plays the hand-made battle at 1x and 994052 at fast', async ({ page }) => {
  const missing = [DUMP, ...NEEDED].filter((path) => !existsSync(path))
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run ${WASM_BUILD_STEPS}, or set IRV_BASE_ROM`,
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

  await test.step('two Start presses during the build start one run', async () => {
    const start = page.getByRole('button', { name: 'Start', exact: true })
    await start.click()
    await start.click()
    // The status line may end on the build's line, which comes at the same moment.
    await expect
      .poll(async () => (await status(page))?.runs, { timeout: 180_000, intervals: [1000] })
      .toEqual({ started: 1, live: 1 })
  })

  await test.step('the hand-made battle reaches END at 1x, with its sound', async () => {
    await playHandMade(page, handMade)
  })

  await test.step('Restart at 2x plays twice as fast', async () => {
    await page.getByLabel('2x').check()
    await page.getByRole('button', { name: 'Restart' }).click()
    await expect(line).toHaveText(new RegExp(`^Running ${HAND_MADE}`))
    await page.waitForTimeout(2_000)
    const { paced, written, read, played, rms } = await rate(page, 5_000)
    report({ stream: HAND_MADE, speed: '2x', paced, written, read, played, rms })
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
    expect(end.audio.writtenToEnd).toBe(0)
    // After END the page leaves fast for 1x, so the game plays on without a core at full load.
    await expect(page.getByLabel('1x')).toBeChecked()
    expect((await status(page))?.speed).toBe('1x')
  })

  expect((await status(page))?.runs.live).toBe(1)
  expect(errors).toEqual([])
})

interface Core {
  setFastForwardMultiplier(multiplier: number): void
  getFastForwardMultiplier(): number
  addCoreCallbacks(callbacks: Record<string, () => void>): void
}
type Probe = typeof globalThis & { irvMgbaCore: Core; irvFrames: number; irvCrashed: boolean }

// Frames per second over WINDOW_MS at `multiplier`, counted by mGBA's end-of-frame callback.
async function mgbaRate(page: Page, multiplier: number) {
  return page.evaluate(
    async ([factor, ms]) => {
      const probe = globalThis as Probe
      probe.irvMgbaCore.setFastForwardMultiplier(factor)
      await new Promise((done) => setTimeout(done, 2_000))
      const [frames, start] = [probe.irvFrames, performance.now()]
      await new Promise((done) => setTimeout(done, ms))
      const fps = ((probe.irvFrames - frames) * 1000) / (performance.now() - start)
      return { multiplier: probe.irvMgbaCore.getFastForwardMultiplier(), fps }
    },
    [multiplier, WINDOW_MS] as const,
  )
}

test('mGBA on the emulator page plays 994052 at fast-forward (B7 measurement)', async ({
  page,
  context,
}) => {
  const missing = [DUMP, ROM_PATCH, SLOT].filter((path) => !existsSync(path))
  test.skip(missing.length > 0, `missing ${missing.join(', ')}; run npm run rom:build`)
  test.setTimeout(300_000)
  await context.route(/\/mgba\.js(\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace('export default mGBA;', EXPOSE_CORE)
    const headers = { ...response.headers() }
    delete headers['content-length']
    await route.fulfill({ response, body, headers })
  })
  const { romSha1 } = JSON.parse(readFileSync(SLOT, 'utf8')) as { romSha1: string }

  await page.goto('/')
  const line = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(new RegExp(romSha1), { timeout: 90_000 })
  await expect(page.getByLabel('Test replay')).toHaveValue(FIRST)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(line).toHaveText(new RegExp(`^Running ${FIRST}`), { timeout: 60_000 })
  await page.evaluate(() => {
    const probe = globalThis as Probe
    probe.irvFrames = 0
    probe.irvCrashed = false
    probe.irvMgbaCore.addCoreCallbacks({
      videoFrameEndedCallback: () => (probe.irvFrames += 1),
      coreCrashedCallback: () => (probe.irvCrashed = true),
    })
  })

  for (const multiplier of MULTIPLIERS) {
    const measured = await mgbaRate(page, multiplier)
    report({ stream: FIRST, engine: 'mGBA', ...measured })
    expect(measured.multiplier).toBe(multiplier)
    expect(measured.fps).toBeGreaterThan(0)
  }
  expect(await page.evaluate(() => (globalThis as Probe).irvCrashed)).toBe(false)
})
