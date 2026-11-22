// The WebAssembly page's replay controls (#52): a replay by link or ID fills the "Not shown in the
// game" list before Start, with the same counts as the emulator page. Showdown is a route that
// answers from the test fixture; the page needs no dump and no module for this. With the dump and
// the module, the replay by link starts at fast and plays its first instructions (#50).
import { expect, test } from '@playwright/test'

import { WASM_BUILD_STEPS } from '../scripts/wasm-link.ts'
import { frame } from './frames.ts'
import { notShownCount, notShownList } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, routeShowdown, showdownUrl } from './showdown.ts'
import { DUMP, missingForModule, waitFor } from './wasm-hook.ts'

const FIRST = 'smogtours-gen3ou-994052'
const LINKED = 'smogtours-gen3ou-994176'

test('a replay loaded by link on the WebAssembly page lists what the emulator page lists', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/wasm.html')
  const summary = page.locator('#replay-summary')
  const status = page.getByRole('status')
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))
  await expect(status).toHaveText(/^Pick your US Emerald dump/)

  await loadReplay(page, 'https://example.com/smogtours-gen3ou-994176')
  await expect(status).toHaveText(/^Could not read the replay link: /)
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  await loadReplay(page, `https://replay.pokemonshowdown.com/${LINKED}`)
  await expect(summary).toHaveText(new RegExp(`^${LINKED}: \\d+ instructions`))
  await expect(status).toHaveText(new RegExp(`^Picked ${LINKED}\\. Press Start`))
  await expect(page.getByLabel('Test replay')).toHaveValue('')
  const onWasm = await notShownList(page)
  expect(await notShownCount(page)).toBeGreaterThan(0)
  expect(onWasm.rows).toHaveLength(await notShownCount(page))

  await page.goto('/')
  await loadReplay(page, LINKED)
  await expect(summary).toHaveText(new RegExp(`^${LINKED}: `))
  expect(await notShownList(page)).toEqual(onWasm)
  expect(notSameOriginGets).toEqual([`GET ${showdownUrl(LINKED)}`, `GET ${showdownUrl(LINKED)}`])
})

test('a test replay picked on the WebAssembly page shows its list and asks for Start', async ({
  page,
  baseURL,
}) => {
  await guardRequests(page, baseURL)
  await page.goto('/wasm.html')
  const second = 'smogtours-gen3ou-994086'
  await page.getByLabel('Test replay').selectOption(second)
  await expect(page.getByRole('status')).toHaveText(new RegExp(`^Picked ${second}\\. Press Start`))
  await expect(page.locator('#replay-summary')).toHaveText(new RegExp(`^${second}: `))
})

// #50 with the module: the replay loaded by link starts at fast, as Start plays what the list
// describes, and the game works through its instructions. The spike test covers END at fast.
test('a replay loaded by link starts at fast on the WebAssembly page and plays its instructions', async ({
  page,
  baseURL,
}) => {
  const missing = missingForModule()
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run ${WASM_BUILD_STEPS}, or set IRV_BASE_ROM`,
  )
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/wasm.html')
  const line = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(/^Your dump is US Emerald/, { timeout: 180_000 })
  await loadReplay(page, LINKED)
  await expect(line).toHaveText(new RegExp(`^Picked ${LINKED}\\. Press Start`))
  const listed = /: (\d+) instructions/.exec(await page.locator('#replay-summary').innerText())

  await page.getByLabel('Fast').check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(line).toHaveText(new RegExp(`^Running ${LINKED}`))
  const now = await waitFor(page, (run) => run.done > 0, 120_000)
  expect(now.speed).toBe('fast')
  expect(now.finished).toBe(false)
  expect(now.done).toBeLessThan(now.total)
  expect(String(now.total)).toBe(listed?.[1])
  await expect(page.locator('#progress')).toHaveText(/^Frame \d+, instruction [1-9]\d* of \d+/)
  expect((await frame(page)).colours).toBeGreaterThan(1)
  expect(notSameOriginGets).toEqual([`GET ${showdownUrl(LINKED)}`])
  expect(errors).toEqual([])
})
