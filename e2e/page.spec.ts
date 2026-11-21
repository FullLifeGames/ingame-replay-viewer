// The dev page in Chromium (plan S5b §5). Tests 1 to 3 need no dump; test 4 reads the user's
// US Emerald by the build's own rule and skips without it or without the built patch, and fails
// on a build that lacks part of the patch series. It shows that the emulator runs the replay's
// ROM; that the replay plays to its end, and that Restart starts it over, is the tester's.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { builtSeriesProblems } from '../scripts/build-series.ts'
import { loadBuildConfig, ROM_DIR } from '../scripts/rom-config.ts'
import { OUTPUT_NAMES } from '../scripts/rom-outputs.ts'
import { buildPaths, REPO_DIR } from '../scripts/rom-paths.ts'
import { readPreflightInput } from '../scripts/rom-preflight.ts'
import { readSeries } from '../scripts/rom-upstream.ts'
import { differ, frame } from './frames.ts'
import { notShownCount } from './page-text.ts'
import { guardRequests } from './requests.ts'

const FIRST = 'smogtours-gen3ou-994052'
const SECOND = 'smogtours-gen3ou-994086'
const BASE_SHA1 = loadBuildConfig().baseRom.sha1
const DUMP = readPreflightInput(process.env, BASE_SHA1).baseRomPath
const PATCH = join(buildPaths().outDir, OUTPUT_NAMES.patch)
const SLOT = join(buildPaths().outDir, OUTPUT_NAMES.slot)
const INFO = join(buildPaths().outDir, OUTPUT_NAMES.info)

/** What build/rom/ lacks of the patch series and the boot file; empty for a whole build. */
function buildProblems(): string[] {
  const info: unknown = JSON.parse(readFileSync(INFO, 'utf8'))
  return builtSeriesProblems(
    info,
    readSeries(readFileSync(join(ROM_DIR, 'patches', 'series'), 'utf8')),
  )
}

/** The stream's length that src/gen3's snapshot of 994052 holds (its spec keeps it true). */
function snapshotLength(): number {
  const snapshot = join(REPO_DIR, 'src', 'gen3', '__snapshots__', `${FIRST}.jsonl`)
  const [head = ''] = readFileSync(snapshot, 'utf8').split('\n', 1)
  return (JSON.parse(head) as { length: number }).length
}

test('the page is cross-origin isolated and offers 994052 first', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate('[isSecureContext, crossOriginIsolated]')).toEqual([true, true])
  await expect(page.getByRole('status')).toHaveText(/Pick your US Emerald dump/)
  await expect(page.getByLabel('Your US Emerald (stays in this tab)')).toBeEnabled()
  await expect(page.getByLabel('Test replay')).toHaveValue(FIRST)
  await expect(page.getByRole('heading', { name: /^Not shown in the game \(\d+\)/ })).toBeVisible()
  expect(await notShownCount(page)).toBeGreaterThan(0)
})

test('a page without COOP and COEP shows only the environment line', async ({ page }) => {
  await page.route('/', async (route) => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    delete headers['cross-origin-opener-policy']
    delete headers['cross-origin-embedder-policy']
    await route.fulfill({ response, headers })
  })
  await page.goto('/')
  await expect(page.getByText(/not cross-origin isolated/)).toBeVisible()
  await expect(page.getByLabel('Your US Emerald (stays in this tab)')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeHidden()
})

test('a file that is not US Emerald is refused before the patch is fetched', async ({ page }) => {
  const romRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/rom/')) romRequests.push(request.url())
  })
  await page.goto('/')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles({
    name: 'not-emerald.gba',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(16 * 1024 * 1024),
  })
  await expect(page.getByRole('status')).toHaveText(new RegExp(BASE_SHA1), { timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Restart' })).toBeDisabled()
  expect(romRequests).toEqual([])
})

test('994052 starts in the emulator, and a second Start runs 994086', async ({ page, baseURL }) => {
  const missing = [
    existsSync(DUMP) ? undefined : `no US Emerald dump at ${DUMP}; set IRV_BASE_ROM to it`,
    existsSync(PATCH) ? undefined : `no ${PATCH}; run npm run rom:build`,
  ].filter((problem) => problem !== undefined)
  test.skip(missing.length > 0, missing.join(' and '))
  test.setTimeout(240_000)
  expect(buildProblems(), 'build/rom/ holds a build that does not boot into the replay').toEqual([])

  const { romSha1 } = JSON.parse(readFileSync(SLOT, 'utf8')) as { romSha1: string }
  const streamBytes = snapshotLength()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const notSameOriginGets = await guardRequests(page, baseURL)

  await page.goto('/')
  const status = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(status).toHaveText(new RegExp(romSha1), { timeout: 90_000 })
  await expect(page.getByLabel('Test replay')).toHaveValue(FIRST)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(status).toHaveText(new RegExp(`Running ${FIRST}.*${String(streamBytes)} bytes`), {
    timeout: 60_000,
  })
  expect(await notShownCount(page)).toBeGreaterThan(0)
  // 240×160 scaled three times; mGBA sets the canvas's own size, the page's CSS its shown size.
  expect(await page.locator('canvas').boundingBox()).toMatchObject({ width: 720, height: 480 })

  await expect.poll(async () => (await frame(page)).colours, { timeout: 30_000 }).toBeGreaterThan(1)
  const first = await frame(page)
  await page.waitForTimeout(5_000)
  const later = await frame(page)
  expect(later.colours).toBeGreaterThan(1)
  expect(differ(first, later)).toBe(true)

  await test.step('frames change after Restart', async () => {
    await page.getByRole('button', { name: 'Restart' }).click()
    await expect(status).toHaveText(new RegExp(`Restarted ${FIRST}`))
    await expect.poll(async () => differ(later, await frame(page)), { timeout: 30_000 }).toBe(true)
  })

  // A new image for the same emulator: quitGame, the old file removed, loadGame again.
  await test.step('a second Start runs another test replay', async () => {
    const before = await frame(page)
    await page.getByLabel('Test replay').selectOption(SECOND)
    await expect(page.locator('#replay-summary')).toHaveText(new RegExp(`^${SECOND}: `))
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(status).toHaveText(new RegExp(`^Running ${SECOND}: `), { timeout: 60_000 })
    await expect.poll(async () => differ(before, await frame(page)), { timeout: 30_000 }).toBe(true)
    await expect
      .poll(async () => (await frame(page)).colours, { timeout: 30_000 })
      .toBeGreaterThan(1)
  })

  expect(await page.evaluate('indexedDB.databases().then((found) => found.length)')).toBe(0)
  expect(errors).toEqual([])
  expect(notSameOriginGets).toEqual([])
})
