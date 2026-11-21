// The WebAssembly spike page in Chromium (#35, plan B5). It reads the user's US Emerald by the
// build's rule and skips without it or without the build outputs. It plays the hand-made battle
// at 1x and 994052 at fast, reads the run's status through the page's test hook, and checks the
// tick rule's pace at 1x and 2x. The frames come from the dump, so only numbers leave the test.
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

interface Status {
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

/** Frames per second over `ms` of a running game. */
async function rate(page: Page, ms: number): Promise<number> {
  const before = (await status(page)) as Status
  await page.waitForTimeout(ms)
  const after = (await status(page)) as Status
  return ((after.frame - before.frame) * 1000) / (after.wallMs - before.wallMs)
}

const report = (numbers: Record<string, number | string>) => {
  process.stdout.write(`wasm-spike: ${JSON.stringify(numbers)}\n`)
}

async function handMadeBytes(): Promise<number[]> {
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const [plan] = await planStreams([HAND_MADE], layout)
  return [...(plan?.stream ?? [])]
}

test('the spike page plays the hand-made battle at 1x and 994052 at fast', async ({ page }) => {
  const missing = [DUMP, ...NEEDED].filter((path) => !existsSync(path))
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run npm run rom:build and npm run wasm:build -- --link, or set IRV_BASE_ROM`,
  )
  test.setTimeout(900_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const handMade = await handMadeBytes()

  await page.goto('/wasm.html')
  expect(await page.evaluate('[isSecureContext, crossOriginIsolated]')).toEqual([true, true])
  const line = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(/built the module/, { timeout: 180_000 })

  await test.step('the hand-made battle reaches END at 1x', async () => {
    await page.evaluate(
      async ([id, bytes]) =>
        (globalThis as unknown as { irvWasmSpike: Hook }).irvWasmSpike.play(id, bytes),
      [HAND_MADE, handMade] as const,
    )
    await page.waitForTimeout(2_000)
    const paced = await rate(page, 5_000)
    expect((await frame(page)).colours).toBeGreaterThan(1)
    const end = await finished(page, 240_000)
    const seconds = (end.finishedMs ?? 0) / 1000
    report({ stream: HAND_MADE, speed: '1x', toEnd: end.finishedAt, seconds, paced })
    expect(end.done).toBe(end.total)
    expect(paced / GBA_FRAMES_PER_SECOND).toBeGreaterThan(0.95)
    expect(paced / GBA_FRAMES_PER_SECOND).toBeLessThan(1.05)
  })

  await test.step('Restart at 2x plays twice as fast', async () => {
    await page.getByLabel('2x').check()
    await page.getByRole('button', { name: 'Restart' }).click()
    await expect(line).toHaveText(new RegExp(`^Running ${HAND_MADE}`))
    await page.waitForTimeout(2_000)
    const paced = await rate(page, 5_000)
    report({ stream: HAND_MADE, speed: '2x', paced })
    expect(paced / GBA_FRAMES_PER_SECOND).toBeGreaterThan(1.9)
    expect(paced / GBA_FRAMES_PER_SECOND).toBeLessThan(2.1)
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
  })

  expect(errors).toEqual([])
})
