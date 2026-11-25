// The emulator page in Chromium (plan S5b §5). Tests 1 to 3 need no dump; tests 4 and 5 read the
// user's US Emerald by the build's own rule and skip without it or without the built patch, and
// fail on a build that lacks part of the patch series. Test 4 shows that the emulator runs the
// replay's ROM; that the replay plays to its end, and that Restart starts it over, is the
// tester's. Test 5 loads an ID that Showdown answers with 404 while the game plays (#69).
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
import { loadReplay, showdownUrl } from './showdown.ts'

const EMULATOR = '/emulator.html'
const FIRST = 'smogtours-gen3ou-994052'
const SECOND = 'smogtours-gen3ou-994086'
const MISSING = 'smogtours-gen3ou-1'
const BASE_SHA1 = loadBuildConfig().baseRom.sha1
// Words for the developer, which a visitor line never holds (#59).
const DEVELOPER_WORDS = /npm run|localhost|devbox|tailscale|README/
const REPORT_FORM_URL =
  'https://github.com/FullLifeGames/ingame-replay-viewer/issues/new?template=replay-problem.yml'
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

/**
 * Skips without the dump or the built patch, naming what is missing, and fails on a build that
 * does not boot into the replay.
 */
function needBuild(): void {
  const missing = [
    existsSync(DUMP) ? undefined : `no US Emerald dump at ${DUMP}; set IRV_BASE_ROM to it`,
    existsSync(PATCH) ? undefined : `no ${PATCH}; run npm run rom:build`,
  ].filter((problem) => problem !== undefined)
  test.skip(missing.length > 0, missing.join(' and '))
  expect(buildProblems(), 'build/rom/ holds a build that does not boot into the replay').toEqual([])
}

/** The stream's length that src/gen3's snapshot of 994052 holds (its spec keeps it true). */
function snapshotLength(): number {
  const snapshot = join(REPO_DIR, 'src', 'gen3', '__snapshots__', `${FIRST}.jsonl`)
  const [head = ''] = readFileSync(snapshot, 'utf8').split('\n', 1)
  return (JSON.parse(head) as { length: number }).length
}

test('the page is cross-origin isolated and offers 994052 first', async ({ page }) => {
  await page.goto(EMULATOR)
  expect(await page.evaluate('[isSecureContext, crossOriginIsolated]')).toEqual([true, true])
  await expect(page.getByRole('link', { name: 'viewer' })).toHaveAttribute('href', './')
  await expect(page.getByRole('status')).toHaveText(/Pick your US Emerald dump/)
  await expect(page.getByLabel('Your US Emerald (stays in this tab)')).toBeEnabled()
  await expect(page.getByLabel('Example replay')).toHaveValue(FIRST)
  await expect(page.getByRole('heading', { name: /^Not shown in the game \(\d+\)/ })).toBeVisible()
  expect(await notShownCount(page)).toBeGreaterThan(0)
  await test.step('a phone-wide page shows the whole screen at 3:2', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(390)
    const { width = 0, height = 0 } = (await page.locator('canvas').boundingBox()) ?? {}
    expect(width).toBeGreaterThan(0)
    expect(width / height).toBeCloseTo(3 / 2, 2)
  })
})

test('a page without COOP and COEP shows only the environment line', async ({ page }) => {
  await page.route(EMULATOR, async (route) => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    delete headers['cross-origin-opener-policy']
    delete headers['cross-origin-embedder-policy']
    await route.fulfill({ response, headers })
  })
  await page.goto(EMULATOR)
  const line = page.locator('#environment-line')
  await expect(line).toHaveText(
    'Your browser did not isolate this page, so the game cannot run. Reload the page. If it ' +
      'fails again, report it with the link below.',
  )
  await expect(line).toBeVisible()
  expect(await line.textContent()).not.toMatch(DEVELOPER_WORDS)
  // The module's words wait under the closed "Details" for whoever runs the dev server.
  const detail = page.locator('#environment-detail')
  await expect(detail).toHaveText(/^This page is not cross-origin isolated/)
  await expect(detail).toBeHidden()
  const report = page.getByRole('link', { name: 'Report this problem' })
  await expect(report).toBeVisible()
  expect(await report.getAttribute('href')).toMatch(
    `${REPORT_FORM_URL}&line=Your%20browser%20did%20not%20isolate`,
  )
  await expect(page.getByLabel('Your US Emerald (stays in this tab)')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeHidden()
})

test('a file that is not US Emerald is refused before the patch is fetched', async ({ page }) => {
  const romRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/rom/')) romRequests.push(request.url())
  })
  await page.goto(EMULATOR)
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles({
    name: 'not-emerald.gba',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(16 * 1024 * 1024),
  })
  // One plain line for the visitor (#59); both SHA1s wait under the closed "Details".
  await expect(page.getByRole('status')).toHaveText(
    'This file is not US Emerald. Pick your US Emerald dump.',
    { timeout: 60_000 },
  )
  await expect(page.locator('#status-detail')).toContainText(`US Emerald's is ${BASE_SHA1}`)
  await expect(page.locator('#status-detail')).toBeHidden()
  expect(await page.getByRole('status').textContent()).not.toMatch(DEVELOPER_WORDS)
  await expect(page.locator('#report')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Restart' })).toBeDisabled()
  expect(romRequests).toEqual([])
})

test('994052 starts in the emulator, and a second Start runs 994086', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  needBuild()

  const { romSha1 } = JSON.parse(readFileSync(SLOT, 'utf8')) as { romSha1: string }
  const streamBytes = snapshotLength()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const notSameOriginGets = await guardRequests(page, baseURL)

  await page.goto(EMULATOR)
  const status = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  // #69: the SHA1 and the byte count wait under "Details", off the status line.
  await expect(status).toHaveText(
    'Your dump is US Emerald, and the page patched it. Press Start.',
    {
      timeout: 90_000,
    },
  )
  await expect(page.locator('#status-detail')).toHaveText(`The patched ROM's SHA1 is ${romSha1}.`)
  await expect(page.getByLabel('Example replay')).toHaveValue(FIRST)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(status).toHaveText(`Running ${FIRST}.`, { timeout: 60_000 })
  await expect(page.locator('#status-detail')).toHaveText(
    `${String(streamBytes)} bytes of instruction stream.`,
  )
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
    await page.getByLabel('Example replay').selectOption(SECOND)
    await expect(page.locator('#replay-summary')).toHaveText(new RegExp(`^${SECOND}: `))
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(status).toHaveText(new RegExp(`^Running ${SECOND}\\.`), { timeout: 60_000 })
    await expect.poll(async () => differ(before, await frame(page)), { timeout: 30_000 }).toBe(true)
    await expect
      .poll(async () => (await frame(page)).colours, { timeout: 30_000 })
      .toBeGreaterThan(1)
  })

  expect(await page.evaluate('indexedDB.databases().then((found) => found.length)')).toBe(0)
  expect(errors).toEqual([])
  expect(notSameOriginGets).toEqual([])
})

test('a Load that fails while a game plays says that the game keeps its replay, and the next pick clears it', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240_000)
  needBuild()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const requests = await guardRequests(page, baseURL)
  // Registered after the guard, so it answers first.
  await page.route(showdownUrl(MISSING), (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body: 'Not found',
    }),
  )
  await page.goto(EMULATOR)
  const status = page.getByRole('status')
  const detail = page.locator('#status-detail')
  const details = page.locator('#details')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(status).toHaveText(/^Your dump is US Emerald, and the page patched it/, {
    timeout: 90_000,
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(status).toHaveText(`Running ${FIRST}.`, { timeout: 60_000 })
  await expect.poll(async () => (await frame(page)).colours, { timeout: 30_000 }).toBeGreaterThan(1)

  await loadReplay(page, MISSING)
  await expect(status).toHaveText(`Showdown has no replay with this ID. The game keeps ${FIRST}.`)
  await expect(detail).not.toHaveText('')
  await expect(details).toBeVisible()
  // The game goes on: its frames go on changing.
  const failed = await frame(page)
  await expect.poll(async () => differ(failed, await frame(page)), { timeout: 30_000 }).toBe(true)

  await page.getByLabel('Example replay').selectOption(SECOND)
  await expect(status).toHaveText(`Picked ${SECOND}. Press Start to play it.`)
  await expect(detail).toHaveText('')
  await expect(details).toBeHidden()
  await expect(page.locator('#report')).toBeHidden()
  expect(errors).toEqual([])
  expect(requests).toEqual([`GET ${showdownUrl(MISSING)}`])
})
