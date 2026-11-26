// What the page's own text says, read the same way by every e2e file.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'
import { readReplay } from '../src/script/replay.ts'
import { replayLabel } from '../src/web/label.ts'

/** The replay label the status lines name the test replay `id` by, from its own JSON (#90). */
export function labelOf(id: string): string {
  const path = join(REPO_DIR, 'test', 'fixtures', 'replays', `${id}.json`)
  const replay = readReplay(JSON.parse(readFileSync(path, 'utf8')))
  return replayLabel(replay.id, replay)
}

/** The characters a pattern reads as its own. */
const SPECIAL = /[.*+?^${}()|[\]\\]/g

/** A pattern for a text that starts with `text` as written: a label holds brackets and dots. */
export const startsWith = (text: string): RegExp =>
  new RegExp(`^${text.replaceAll(SPECIAL, '\\$&')}`)

/** The replay's counts under "Details" (#90), as `#replay-detail` holds them. */
export const COUNTS = /^\d+ instructions, \d+ bytes of instruction stream\.$/

/** The words under "Details", read as text: a closed disclosure renders none of them. */
export const detailText = async (page: Page, id: string): Promise<string> =>
  (await page.locator(`#${id}`).textContent()) ?? ''

/** The count in the heading "Not shown in the game (n)". */
export async function notShownCount(page: Page): Promise<number> {
  const heading = await page.getByRole('heading', { name: /^Not shown in the game/ }).innerText()
  return Number(/\((\d+)\)/.exec(heading)?.[1] ?? Number.NaN)
}

/**
 * The list under the game, as the page shows it: the summary, its counts under "Details", the
 * heading, the counts of what is not shown and the rows.
 */
export async function notShownList(page: Page) {
  return {
    summary: await page.locator('#replay-summary').innerText(),
    detail: await detailText(page, 'replay-detail'),
    heading: await page.getByRole('heading', { name: /^Not shown in the game/ }).innerText(),
    counts: await page.locator('#not-shown-counts li').allInnerTexts(),
    rows: await page.locator('#not-shown-rows li').allInnerTexts(),
  }
}

/** How wide the page's content is, in CSS pixels: more than the viewport scrolls it sideways. */
export const scrollWidth = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  )
