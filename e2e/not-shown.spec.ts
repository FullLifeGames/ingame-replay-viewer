// The "Not shown in the game" list on a phone (#90): at 390 px a row wraps where it must, but never
// inside its log line's first field, where a row once broke after the hyphen of "|-fieldstart".
// The row reads as before, and its parts are text. Runs without the dump: a pick fills the list.
import { expect, type Page, test } from '@playwright/test'

import { notShownCount, scrollWidth } from './page-text.ts'
import { guardRequests } from './requests.ts'

const ROOST = 'smogtours-gen4ou-690421'
const WIDTH = 390

test.use({ viewport: { width: WIDTH, height: 844 } })

/** What the page's window offers to `page.evaluate`; the e2e compiles without the DOM types. */
interface Kinds {
  querySelectorAll(selectors: string): ArrayLike<{
    textContent: string | null
    getClientRects(): ArrayLike<unknown>
  }>
}

/** Each first field of the list's rows with the count of lines the browser lays it out on. */
const kindLines = (page: Page) =>
  page.evaluate(() =>
    Array.from(
      (globalThis as unknown as { document: Kinds }).document.querySelectorAll(
        '#not-shown-rows .log-kind',
      ),
      (kind) => ({ kind: kind.textContent ?? '', lines: kind.getClientRects().length }),
    ),
  )

test('a "Not shown" row keeps its first field on one line on a phone', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  await page.getByLabel('Example replay').selectOption(ROOST)
  await expect(page.locator('#replay-summary')).toHaveText(/\(690421\)$/)
  const count = await notShownCount(page)
  await expect(page.locator('#not-shown-rows li')).toHaveCount(count)

  const rows = await page.locator('#not-shown-rows li').allInnerTexts()
  // The row reads as one text, its first field joined to the rest of the log line.
  expect(rows.some((row) => row.includes(': |-singleturn|p1a: Skarmory|move: Roost'))).toBe(true)
  const kinds = await kindLines(page)
  expect(kinds.map(({ kind }) => kind)).toContain('|-singleturn')
  expect(kinds.filter(({ lines }) => lines !== 1)).toEqual([])
  // A row holds text and the one span of its first field, nothing else.
  await expect(page.locator('#not-shown-rows li *:not(span.log-kind)')).toHaveCount(0)
  expect(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)
  expect(notSameOriginGets).toEqual([])
})
