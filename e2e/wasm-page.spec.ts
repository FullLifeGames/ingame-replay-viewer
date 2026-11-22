// The WebAssembly page's replay controls (#52): a replay by link or ID fills the "Not shown in the
// game" list before Start, with the same counts as the emulator page. Showdown is a route that
// answers from the test fixture; the page needs no dump and no module for this.
import { expect, test } from '@playwright/test'

import { notShownCount, notShownList } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, routeShowdown, showdownUrl } from './showdown.ts'

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
