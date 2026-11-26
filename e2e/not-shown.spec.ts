// The "Not shown in the game" list on a phone (#90): at 390 px a row wraps where it must, but never
// inside its log line's first field, where a row once broke after the hyphen of "|-fieldstart".
// The row reads as before, and its parts are text. On both pages a copy of 690421 with three wide
// first fields goes red without either of the pages' two rules for the rows, and a first field
// longer than the protocol's longest wraps, so the page stays as wide as the phone. Runs without
// the dump: a pick fills the list.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'
import { readReplay } from '../src/script/replay.ts'
import { jsonFile } from '../src/script/saved-replay-testing.ts'
import { notShownCount, scrollWidth } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, showdownUrl } from './showdown.ts'

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

// Three first fields that no Showdown line has, each wider than the room it gets at 390 px, where a
// row's content box is 334 px wide and its head about 215 px. HYPHEN_KIND has 20 characters, as
// many as the protocol's longest: it does not fit after the head, so it breaks after "|-" unless
// the page keeps the field whole. WIDE_KIND has 24 fullwidth letters, about 370 px, and LONG_FIELD
// 31 characters with no place to break, about 400 px: the row must wrap them.
const HYPHEN_KIND = `|-${'W'.repeat(18)}`
const WIDE_KIND = `|${'\uff37'.repeat(23)}`
const LONG_FIELD = `|${'W'.repeat(30)}`
const WIDE_FIELDS = [HYPHEN_KIND, WIDE_KIND, LONG_FIELD]

/** 690421's JSON file with a line for each wide field after its first turn line. */
function wideReplay(): string {
  const path = join(REPO_DIR, 'test', 'fixtures', 'replays', `${ROOST}.json`)
  const replay = readReplay(JSON.parse(readFileSync(path, 'utf8')))
  const wide = WIDE_FIELDS.map((field) => `${field}|x\n`).join('')
  return jsonFile({ ...replay, log: replay.log.replace('\n|turn|1\n', `\n|turn|1\n${wide}`) })
}

/** The rows of the wide replay hold their lines whole, and the page stays as wide as the phone. */
async function expectWideRows(page: Page): Promise<void> {
  await expect(page.locator('#replay-summary')).toHaveText(/\(690421\)$/)
  const rows = await page.locator('#not-shown-rows li').allInnerTexts()
  for (const field of WIDE_FIELDS)
    expect(rows.some((row) => row.includes(`: ${field}|x`))).toBe(true)
  const kinds = await kindLines(page)
  expect(kinds.map(({ kind }) => kind)).toContain(HYPHEN_KIND)
  // Soft, so a red run names each rule of the page that it misses.
  expect.soft(kinds.filter(({ lines }) => lines !== 1)).toEqual([])
  expect.soft(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)
}

test('a first field of wide glyphs from a replay file keeps the viewer as wide as a phone', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  await page.locator('#replay-file').setInputFiles({
    name: `${ROOST}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(wideReplay()),
  })
  await expectWideRows(page)
  expect(notSameOriginGets).toEqual([])
})

test('a first field of wide glyphs from Showdown keeps the emulator page as wide as a phone', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.route(showdownUrl(ROOST), (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: wideReplay(),
    }),
  )
  await page.goto('/emulator.html')
  await loadReplay(page, ROOST)
  await expectWideRows(page)
  expect(notSameOriginGets).toEqual([`GET ${showdownUrl(ROOST)}`])
})
