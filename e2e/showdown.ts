// Showdown for the e2e: a route that answers a replay's JSON from the test fixture, so no request
// leaves devbox, and the Load of a replay by link or ID that both pages offer.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'

/** The URL of the JSON that the page fetches for the replay `id`. */
export const showdownUrl = (id: string): string => `https://replay.pokemonshowdown.com/${id}.json`

/** Showdown's answer for `id`, with the CORS header Showdown sends, from the test fixture. */
export async function routeShowdown(page: Page, id: string): Promise<void> {
  const body = readFileSync(join(REPO_DIR, 'test', 'fixtures', 'replays', `${id}.json`))
  await page.route(showdownUrl(id), (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body,
    }),
  )
}

/** Types `input` into "Replay link or ID" and presses Load. */
export async function loadReplay(page: Page, input: string): Promise<void> {
  await page.getByLabel('Replay link or ID').fill(input)
  await page.getByRole('button', { name: 'Load' }).click()
}
