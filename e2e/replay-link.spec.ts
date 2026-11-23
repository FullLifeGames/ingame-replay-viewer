// A replay by link or ID in the viewer at / (plan S5b §5; the emulator page shares the form and
// wasm-page.spec.ts compares its list). Showdown is a route that answers from the test fixture,
// so no request leaves the machine; the page needs no dump for this. A failure shows its visitor
// line, the module's words under "Details" and, where the line offers one, the report link (#59).
import { expect, test } from '@playwright/test'

import { notShownCount } from './page-text.ts'
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
  await expect(status).toHaveText(/^Picked smogtours-gen3ou-994086\. Press Start/)

  await loadReplay(page, LINKED)
  await expect(status).toHaveText(new RegExp(`^Picked ${LINKED}\\. Press Start`))
  await expect(testReplay).toHaveValue('')

  await testReplay.selectOption(FIRST)
  await expect(status).toHaveText(new RegExp(`^Picked ${FIRST}\\. Press Start`))
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
  await expect(status).toHaveText(new RegExp(`^Picked ${LINKED}\\. Press Start`))
  await expect(detail).toHaveText('')
  await expect(page.locator('#details')).toBeHidden()
  await expect(report).toBeHidden()
  await testReplay.selectOption(OTHER)
  await expect(status).toHaveText(EXAMPLE_LINE)
  await expect(summary).toHaveText(new RegExp(`^${LINKED}: `))
  await expect(testReplay).toHaveValue('')
  expect(notSameOriginGets).toEqual([`GET ${SHOWDOWN}`])
})
