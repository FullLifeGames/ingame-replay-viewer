// A replay by link or ID (plan S5b §5). Showdown is a route that answers from the test fixture,
// so no request leaves devbox; the page needs no dump for this.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'
import { notShownCount } from './page-text.ts'
import { guardRequests } from './requests.ts'

const FIRST = 'smogtours-gen3ou-994052'
const LINKED = 'smogtours-gen3ou-994176'
const SHOWDOWN = `https://replay.pokemonshowdown.com/${LINKED}.json`

/** Showdown's answer for LINKED, with the CORS header Showdown sends, from the test fixture. */
async function routeShowdown(page: Page): Promise<void> {
  const body = readFileSync(join(REPO_DIR, 'test', 'fixtures', 'replays', `${LINKED}.json`))
  await page.route(SHOWDOWN, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body,
    }),
  )
}

async function load(page: Page, input: string): Promise<void> {
  await page.getByLabel('Replay link or ID').fill(input)
  await page.getByRole('button', { name: 'Load' }).click()
}

test('a replay loaded by its link fills the list, and only Showdown is asked', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page)
  await page.goto('/')
  const summary = page.locator('#replay-summary')
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  await load(page, 'https://example.com/smogtours-gen3ou-994176')
  await expect(page.getByRole('status')).toHaveText(/^Could not read the replay link: /)
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  await load(page, `https://replay.pokemonshowdown.com/${LINKED}`)
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
  await routeShowdown(page)
  await page.goto('/')
  const status = page.getByRole('status')
  const testReplay = page.getByLabel('Test replay')
  await expect(status).toHaveText(/^Pick your US Emerald dump/)

  await testReplay.selectOption('smogtours-gen3ou-994086')
  await expect(status).toHaveText(/^Picked smogtours-gen3ou-994086\. Press Start/)

  await load(page, LINKED)
  await expect(status).toHaveText(new RegExp(`^Picked ${LINKED}\\. Press Start`))
  await expect(testReplay).toHaveValue('')

  await testReplay.selectOption(FIRST)
  await expect(status).toHaveText(new RegExp(`^Picked ${FIRST}\\. Press Start`))
})
