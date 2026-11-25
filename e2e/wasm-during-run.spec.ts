// What the viewer does with a press or a failed Load while a game plays (#69), in Chromium. Each
// test reads the user's US Emerald by the build's rule and skips without it or without the
// module. A double click on Start during a run leaves one run, which plays the replay from its
// beginning, and Start enabled. A Load that Showdown answers with 404 during a run says that the
// game plays on, and the next pick's line leaves nothing of that failure. No request leaves the
// page but the routed one.
import { expect, type Page, test } from '@playwright/test'

import { WASM_BUILD_STEPS } from '../scripts/wasm-link.ts'
import { GBA_FRAMES_PER_SECOND } from '../src/web/wasm/protocol.ts'
import { labelOf } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, showdownUrl } from './showdown.ts'
import { DUMP, missingForModule, report, status, waitFor } from './wasm-hook.ts'

const FIRST = 'smogtours-gen3ou-994052'
const OTHER = 'smogtours-gen3ou-994086'
const FIRST_LABEL = labelOf(FIRST)
const MISSING = 'smogtours-gen3ou-1'

type Hooked = typeof globalThis & {
  irvWasmViewer: { status(): { wallMs: number } | undefined }
  irvPressedAt: number
}

/**
 * Skips without the dump or the module, opens the viewer at 1x and builds the game from the dump.
 * Returns the page's errors and the requests that left it (`guardRequests`).
 */
async function openWithDump(page: Page, baseURL: string | undefined) {
  const missing = missingForModule()
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run ${WASM_BUILD_STEPS}, or set IRV_BASE_ROM`,
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const requests = await guardRequests(page, baseURL)
  await page.goto('/')
  await page.getByLabel('1x').check()
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(page.getByRole('status')).toHaveText(/^Your dump is US Emerald/, {
    timeout: 180_000,
  })
  return { errors, requests }
}

const startButton = (page: Page) => page.getByRole('button', { name: 'Start', exact: true })

/** Presses Start on the picked 994052 and waits until its game reached `frame`. */
async function playFirst(page: Page, frame: number) {
  await startButton(page).click()
  await expect(page.getByRole('status')).toHaveText(`Running ${FIRST_LABEL}.`, { timeout: 60_000 })
  return waitFor(page, (now) => now.frame >= frame, 60_000)
}

/**
 * The current run's status, and the time since the page noted `irvPressedAt`, read in one call:
 * a run whose wall time is at most that time began after the mark.
 */
const sincePress = (page: Page) =>
  page.evaluate(() => {
    const hooked = globalThis as Hooked
    return {
      wallMs: hooked.irvWasmViewer.status()?.wallMs ?? Number.NaN,
      sinceMark: performance.now() - hooked.irvPressedAt,
    }
  })

test('a double click on Start during a run leaves one run, from the beginning, and Start enabled', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(420_000)
  const { errors, requests } = await openWithDump(page, baseURL)
  const start = startButton(page)
  const played = await playFirst(page, 300)

  await test.step('a double click with the mouse', async () => {
    await page.evaluate(() => {
      ;(globalThis as Hooked).irvPressedAt = performance.now()
    })
    await start.dblclick()
    // The second click may land before or after the new run begins, so the count of runs started
    // is reported, and the test pins what holds either way.
    await expect
      .poll(async () => (await status(page))?.runs.started, { timeout: 60_000, intervals: [500] })
      .toBeGreaterThan(played.runs.started)
    await expect(start).toBeEnabled({ timeout: 60_000 })
    const now = await waitFor(page, (run) => run.runs.live === 1, 60_000)
    const { wallMs, sinceMark } = await sincePress(page)
    report({ step: 'double click', started: now.runs.started - played.runs.started, wallMs })
    expect(now.runs.live).toBe(1)
    // The current run began after the mark, so its game counts its frames from the beginning.
    expect(wallMs).toBeLessThanOrEqual(sinceMark)
    expect(now.frame).toBeLessThanOrEqual(GBA_FRAMES_PER_SECOND * (now.wallMs / 1000) + 60)
    await expect(page.getByRole('status')).toHaveText(`Running ${FIRST_LABEL}.`)
  })

  await test.step('two clicks in one task start one run', async () => {
    const before = (await waitFor(page, (run) => run.frame >= 60, 60_000)).runs.started
    // Both clicks land before any await of the first, so the second finds Start disabled.
    const disabledAtSecond = await start.evaluate(
      (button: { disabled: boolean; click(): void }) => {
        button.click()
        const disabled = button.disabled
        button.click()
        return disabled
      },
    )
    expect(disabledAtSecond).toBe(true)
    await expect(start).toBeEnabled({ timeout: 60_000 })
    expect((await status(page))?.runs).toEqual({ started: before + 1, live: 1 })
  })

  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('a Load that fails during a run says that the game plays on, and the next pick clears it', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(420_000)
  const { errors, requests } = await openWithDump(page, baseURL)
  // Registered after the guard, so it answers first.
  await page.route(showdownUrl(MISSING), (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body: 'Not found',
    }),
  )
  const line = page.getByRole('status')
  const detail = page.locator('#status-detail')
  const details = page.locator('#details')
  const reportLink = page.locator('#report')
  const played = await playFirst(page, 60)

  await loadReplay(page, MISSING)
  await expect(line).toHaveText(
    `Showdown has no replay with this ID. The game plays on with ${FIRST_LABEL}.`,
  )
  await expect(detail).not.toHaveText('')
  await expect(details).toBeVisible()
  // The game does play on: the same run, further on.
  const later = await waitFor(page, (now) => now.frame > played.frame + 60, 60_000)
  expect(later.runs).toEqual(played.runs)

  await page.getByLabel('Example replay').selectOption(OTHER)
  await expect(line).toHaveText(`Picked ${OTHER}. Press Start to play it.`)
  await expect(detail).toHaveText('')
  // "Details" stays for the run's progress line alone, which it holds while a game plays.
  await expect(details).toBeVisible()
  await expect(page.locator('#details p:not(:empty)')).toHaveCount(1)
  await expect(page.locator('#progress')).toHaveText(/^Frame \d+, /)
  await expect(reportLink).toBeHidden()
  expect((await status(page))?.runs).toEqual(played.runs)
  expect(errors).toEqual([])
  expect(requests).toEqual([`GET ${showdownUrl(MISSING)}`])
})
