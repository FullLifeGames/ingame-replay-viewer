// The team list under the game (#87): a replay that opens with Team Preview lists both teams of
// six, the far side first and each side in the log's order, on a phone-wide screen without a
// sideways scroll. Both lists start level when one heading wraps, and a second pick replaces them.
// A replay without Team Preview hides the list. The page needs no dump for this.
import { expect, type Page, test } from '@playwright/test'

import { scrollWidth } from './page-text.ts'
import { guardRequests } from './requests.ts'

const GEN5 = 'smogtours-gen5ou-862240'
const GEN5_LADDER = 'gen5ou-2718717830'
const GEN3 = 'smogtours-gen3ou-994052'
const WIDTH = 390

test.use({ viewport: { width: WIDTH, height: 844 } })

const teams = (page: Page) => ({
  list: page.locator('#teams'),
  far: page.locator('#teams-far'),
  near: page.locator('#teams-near'),
  farMembers: page.locator('#teams-far-members li'),
  nearMembers: page.locator('#teams-near-members li'),
})

/** Where an element's top sits in the viewport, in CSS pixels. */
async function topOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox()
  if (box === null) throw new Error(`${selector} is not on the page`)
  return box.y
}

test('a Gen 5 pick lists both teams of six under the game, and a Gen 3 pick hides them', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  const { list, far, near, farMembers, nearMembers } = teams(page)
  await expect(page.locator('#panel-far')).toHaveText('Far side: xXEricXx')
  await expect(list).toBeHidden()

  await page.getByLabel('Example replay').selectOption(GEN5)
  await expect(list).toBeVisible()
  await expect(page.locator('#teams h2')).toHaveText('Teams')
  await expect(far).toHaveText('Far side: Monai')
  await expect(near).toHaveText('Near side: tizio potente ao')
  await expect(far).toHaveText(await page.locator('#panel-far').innerText())
  await expect(near).toHaveText(await page.locator('#panel-near').innerText())
  await expect(farMembers).toHaveText([
    'Tyranitar ♂',
    'Conkeldurr ♂',
    'Landorus-Therian ♂',
    'Starmie',
    'Jirachi',
    'Latias ♀',
  ])
  await expect(nearMembers).toHaveText([
    'Tyranitar ♀',
    'Jirachi',
    'Terrakion',
    'Breloom ♀',
    'Starmie',
    'Landorus-Therian ♂',
  ])
  expect(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)

  await page.getByLabel('Example replay').selectOption(GEN3)
  await expect(page.locator('#panel-far')).toHaveText('Far side: xXEricXx')
  await expect(list).toBeHidden()
  expect(notSameOriginGets).toEqual([])
})

test('both lists start level when the near heading wraps to two lines', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Example replay').selectOption(GEN5)
  const { list, near } = teams(page)
  await expect(list).toBeVisible()
  await expect(near).toHaveText('Near side: tizio potente ao')
  const far = await topOf(page, '#teams-far-members li:first-child')
  const nearTop = await topOf(page, '#teams-near-members li:first-child')
  expect(Math.abs(far - nearTop)).toBeLessThanOrEqual(1)
  expect(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)
})

test('a second Gen 5 pick replaces both teams and their headings', async ({ page }) => {
  await page.goto('/')
  const { list, far, near, farMembers, nearMembers } = teams(page)
  await page.getByLabel('Example replay').selectOption(GEN5)
  await expect(far).toHaveText('Far side: Monai')

  await page.getByLabel('Example replay').selectOption(GEN5_LADDER)
  await expect(list).toBeVisible()
  await expect(far).toHaveText('Far side: abc2158')
  await expect(near).toHaveText('Near side: isolatedstar')
  await expect(farMembers).toHaveText([
    'Ninetales ♂',
    'Volcarona ♂',
    'Starmie',
    'Darmanitan ♀',
    'Blissey ♀',
    'Ferrothorn ♂',
  ])
  await expect(nearMembers).toHaveText([
    'Ferrothorn ♀',
    'Keldeo',
    'Politoed ♂',
    'Tentacruel ♀',
    'Thundurus-Therian ♂',
    'Scizor ♀',
  ])
})
