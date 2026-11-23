// A replay by link or ID in the viewer at / (plan S5b §5; the emulator page shares the form and
// wasm-page.spec.ts compares its list). Showdown is a route that answers from the test fixture,
// so no request leaves devbox; the page needs no dump for this.
import { expect, test } from '@playwright/test'

import { notShownCount } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, routeShowdown, showdownUrl } from './showdown.ts'

const FIRST = 'smogtours-gen3ou-994052'
const LINKED = 'smogtours-gen3ou-994176'
const SHOWDOWN = showdownUrl(LINKED)

test('a replay loaded by its link fills the list, and only Showdown is asked', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/')
  const summary = page.locator('#replay-summary')
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  await loadReplay(page, 'https://example.com/smogtours-gen3ou-994176')
  await expect(page.getByRole('status')).toHaveText(/^Could not read the replay link: /)
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  await loadReplay(page, `https://replay.pokemonshowdown.com/${LINKED}`)
  await expect(summary).toHaveText(new RegExp(`^${LINKED}: \\d+ instructions`))
  const count = await notShownCount(page)
  expect(count).toBeGreaterThan(0)
  await expect(page.locator('#not-shown-rows li')).toHaveCount(count)
  expect(notSameOriginGets).toEqual([`GET ${SHOWDOWN}`])
})

test('after a new pick or a Load the page asks for Start and shows which replay is in', async ({
  page,
  baseURL,
}) => {
  await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/')
  const status = page.getByRole('status')
  const testReplay = page.getByLabel('Test replay')
  await expect(status).toHaveText(/^Pick your US Emerald dump/)

  await testReplay.selectOption('smogtours-gen3ou-994086')
  await expect(status).toHaveText(/^Picked smogtours-gen3ou-994086\. Press Start/)

  await loadReplay(page, LINKED)
  await expect(status).toHaveText(new RegExp(`^Picked ${LINKED}\\. Press Start`))
  await expect(testReplay).toHaveValue('')

  await testReplay.selectOption(FIRST)
  await expect(status).toHaveText(new RegExp(`^Picked ${FIRST}\\. Press Start`))
})
