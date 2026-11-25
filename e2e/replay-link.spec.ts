// A replay by link or ID in the viewer at / (plan S5b §5; the emulator page shares the form and
// wasm-page.spec.ts compares its list). Showdown is a route that answers from the test fixture,
// so no request leaves the machine; the page needs no dump for this. A failure shows its visitor
// line, the module's words under "Details" and, where the line offers one, the report link (#59).
// The select labels each example replay by its format, players and number (#69).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'
import { labelOf, notShownCount } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, routeShowdown, showdownUrl } from './showdown.ts'

const FIRST = 'smogtours-gen3ou-994052'
const LINKED = 'smogtours-gen3ou-994176'
const OTHER = 'smogtours-gen3ou-994086'
const SHOWDOWN = showdownUrl(LINKED)
/** The line of an example whose file did not arrive (#59). */
const EXAMPLE_LINE =
  'The page could not load this example. Check your connection and pick it again.'
/** The line of every refusal of the link field (#59). */
const LINK_LINE =
  '"Replay link or ID" takes a replay ID such as smogtours-gen3ou-994052, or a link to a replay ' +
  'on replay.pokemonshowdown.com.'

test('a replay loaded by its link fills the list, and only Showdown is asked', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/')
  const summary = page.locator('#replay-summary')
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  const status = page.getByRole('status')
  const detail = page.locator('#status-detail')
  const details = page.locator('#details')
  // Start without a dump: the line says it all, so the page shows no "Details" (#59).
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(status).toHaveText('Pick your US Emerald dump first, then press Start.')
  await expect(details).toBeHidden()

  await loadReplay(page, 'https://example.com/smogtours-gen3ou-994176')
  await expect(status).toHaveText(LINK_LINE)
  await expect(detail).toHaveText(/^Could not read the replay link: example\.com is not /)
  await expect(details).toBeVisible()
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  // A link with markup in it shows as text: the page writes no line as HTML.
  await loadReplay(page, '<img id=injected src=x>')
  await expect(status).toHaveText(LINK_LINE)
  await expect(detail).toHaveText(
    /^Could not read the replay link: "<img id=injected src=x>" is not a replay ID/,
  )
  await expect(page.locator('#injected')).toHaveCount(0)
  await expect(page.locator('#report')).toBeHidden()

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
  const testReplay = page.getByLabel('Example replay')
  await expect(status).toHaveText(/^Pick your US Emerald dump/)

  await testReplay.selectOption('smogtours-gen3ou-994086')
  await expect(status).toHaveText(
    `Picked ${labelOf('smogtours-gen3ou-994086')}. Press Start to play it.`,
  )

  await loadReplay(page, LINKED)
  await expect(status).toHaveText(`Picked ${labelOf(LINKED)}. Press Start to play it.`)
  await expect(testReplay).toHaveValue('')

  await testReplay.selectOption(FIRST)
  await expect(status).toHaveText(`Picked ${labelOf(FIRST)}. Press Start to play it.`)
})

test('an example replay that fails to load leaves the select on the replay the page holds', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  const aborted: string[] = []
  await page.route(/smogtours-gen3ou-994086\.json/, (route) => {
    aborted.push(route.request().url())
    return route.abort()
  })
  await page.goto('/')
  const status = page.getByRole('status')
  const summary = page.locator('#replay-summary')
  const testReplay = page.locator('#test-replay')
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))

  const detail = page.locator('#status-detail')
  const report = page.locator('#report')
  await testReplay.selectOption(OTHER)
  await expect(status).toHaveText(EXAMPLE_LINE)
  await expect(detail).toHaveText(new RegExp(`^Could not load the example replay ${OTHER}: `))
  await expect(detail).toBeHidden()
  await expect(page.locator('#details')).toBeVisible()
  await expect(report).toBeHidden()
  expect(aborted.length).toBeGreaterThan(0)
  await expect(summary).toHaveText(new RegExp(`^${FIRST}: `))
  await expect(testReplay).toHaveValue(FIRST)

  // A line that went well clears the old failure's words, and "Details" hides with nothing in it.
  await loadReplay(page, LINKED)
  await expect(status).toHaveText(`Picked ${labelOf(LINKED)}. Press Start to play it.`)
  await expect(detail).toHaveText('')
  await expect(page.locator('#details')).toBeHidden()
  await expect(report).toBeHidden()
  await testReplay.selectOption(OTHER)
  await expect(status).toHaveText(EXAMPLE_LINE)
  await expect(summary).toHaveText(new RegExp(`^${LINKED}: `))
  await expect(testReplay).toHaveValue('')
  expect(notSameOriginGets).toEqual([`GET ${SHOWDOWN}`])
})

/** The generated list the labels come from: each replay's own format and players. */
const EXAMPLES = JSON.parse(
  readFileSync(join(REPO_DIR, 'src', 'web', 'example-replays.json'), 'utf8'),
) as Record<string, { format: string; players: string[] }>

test('the example select labels each replay by its format, players and number', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  const options = page.locator('#test-replay option')
  await expect(options).toHaveCount(Object.keys(EXAMPLES).length)
  const shown = await options.evaluateAll((list: { value: string; textContent: string | null }[]) =>
    list.map(({ value, textContent }) => ({ value, text: textContent ?? '' })),
  )
  expect(shown[0]).toEqual({ value: FIRST, text: 'Gen 3 OU: A Welcome Guest vs xXEricXx (994052)' })
  expect(shown).toContainEqual({
    value: 'gen3randombattle-2717609379',
    text: 'Gen 3 Random Battle: NewbiePlsForgiveMe vs joltylocks (2717609379)',
  })
  // Each option holds a replay of the list, with its players in order and its number at the end.
  expect(shown.map(({ value }) => value).toSorted()).toEqual(Object.keys(EXAMPLES).toSorted())
  for (const { value, text } of shown) {
    const { players } = EXAMPLES[value] ?? { players: [] }
    expect(text).toContain(`: ${players.join(' vs ')} (`)
    expect(text.endsWith(`(${value.slice(value.lastIndexOf('-') + 1)})`)).toBe(true)
  }
  // The value stays the id, so a pick by id still loads the replay.
  await page.getByLabel('Example replay').selectOption(OTHER)
  await expect(page.locator('#replay-summary')).toHaveText(new RegExp(`^${OTHER}: `))
  expect(notSameOriginGets).toEqual([])
})
