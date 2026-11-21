// The dev page in Chromium (plan S5b §5). Tests 1 to 3 need no dump; test 4 reads the user's
// US Emerald by the build's own rule and skips without it or without the built patch.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { loadBuildConfig } from '../scripts/rom-config.ts'
import { OUTPUT_NAMES } from '../scripts/rom-outputs.ts'
import { buildPaths, REPO_DIR } from '../scripts/rom-paths.ts'
import { readPreflightInput } from '../scripts/rom-preflight.ts'
import { differ, frame } from './frames.ts'

const FIRST = 'smogtours-gen3ou-994052'
const BASE_SHA1 = loadBuildConfig().baseRom.sha1
const DUMP = readPreflightInput(process.env, BASE_SHA1).baseRomPath
const PATCH = join(buildPaths().outDir, OUTPUT_NAMES.patch)
const SLOT = join(buildPaths().outDir, OUTPUT_NAMES.slot)

/** The stream's length that src/gen3's snapshot of 994052 holds (its spec keeps it true). */
function snapshotLength(): number {
  const snapshot = join(REPO_DIR, 'src', 'gen3', '__snapshots__', `${FIRST}.jsonl`)
  const [head = ''] = readFileSync(snapshot, 'utf8').split('\n', 1)
  return (JSON.parse(head) as { length: number }).length
}

const notShownCount = async (page: Page): Promise<number> => {
  const heading = await page.getByRole('heading', { name: /^Not shown in the game/ }).innerText()
  return Number(/\((\d+)\)/.exec(heading)?.[1] ?? Number.NaN)
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

test('994052 starts in the emulator', async ({ page }) => {
  const missing = [
    existsSync(DUMP) ? undefined : `no US Emerald dump at ${DUMP}; set IRV_BASE_ROM to it`,
    existsSync(PATCH) ? undefined : `no ${PATCH}; run npm run rom:build`,
  ].filter((problem) => problem !== undefined)
  test.skip(missing.length > 0, missing.join(' and '))
  test.setTimeout(240_000)

  const { romSha1 } = JSON.parse(readFileSync(SLOT, 'utf8')) as { romSha1: string }
  const streamBytes = snapshotLength()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  const status = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(status).toHaveText(new RegExp(romSha1), { timeout: 90_000 })
  await expect(page.getByLabel('Test replay')).toHaveValue(FIRST)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(status).toHaveText(new RegExp(`Running ${FIRST}.*${String(streamBytes)} bytes`), {
    timeout: 60_000,
  })
  await expect(status).toHaveText(new RegExp(romSha1))
  expect(await notShownCount(page)).toBeGreaterThan(0)
  // 240×160 scaled three times; mGBA sets the canvas's own size, the page's CSS its shown size.
  expect(await page.locator('canvas').boundingBox()).toMatchObject({ width: 720, height: 480 })

  await expect.poll(async () => (await frame(page)).colours, { timeout: 30_000 }).toBeGreaterThan(1)
  const first = await frame(page)
  await page.waitForTimeout(5_000)
  const later = await frame(page)
  expect(later.colours).toBeGreaterThan(1)
  expect(differ(first, later)).toBe(true)

  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(status).toHaveText(new RegExp(`Restarted ${FIRST}`))
  await expect.poll(async () => differ(later, await frame(page)), { timeout: 30_000 }).toBe(true)

  expect(await page.evaluate('indexedDB.databases().then((found) => found.length)')).toBe(0)
  expect(errors).toEqual([])
})
