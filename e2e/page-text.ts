// What the page's own text says, read the same way by every e2e file.
import type { Page } from '@playwright/test'

/** The count in the heading "Not shown in the game (n)". */
export async function notShownCount(page: Page): Promise<number> {
  const heading = await page.getByRole('heading', { name: /^Not shown in the game/ }).innerText()
  return Number(/\((\d+)\)/.exec(heading)?.[1] ?? Number.NaN)
}

/** The list under the game, as the page shows it: the summary, the heading, the counts and rows. */
export async function notShownList(page: Page) {
  return {
    summary: await page.locator('#replay-summary').innerText(),
    heading: await page.getByRole('heading', { name: /^Not shown in the game/ }).innerText(),
    counts: await page.locator('#not-shown-counts li').allInnerTexts(),
    rows: await page.locator('#not-shown-rows li').allInnerTexts(),
  }
}
