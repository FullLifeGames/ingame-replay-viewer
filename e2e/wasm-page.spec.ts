// The viewer's replay controls (#52): a replay by link or ID fills the "Not shown in the
// game" list before Start, with the same counts as the emulator page. Showdown is a route that
// answers from the test fixture; the page needs no dump and no module for this. With the dump and
// the module, the replay by link starts at fast and plays its first instructions (#50), and a run
// without sound keeps the reason in its END line (#59).
import { expect, test } from '@playwright/test'

import { WASM_BUILD_STEPS } from '../scripts/wasm-link.ts'
import { frame } from './frames.ts'
import {
  COUNTS,
  detailText,
  labelOf,
  notShownCount,
  notShownList,
  startsWith,
} from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, routeShowdown, showdownUrl } from './showdown.ts'
import {
  DUMP,
  finished,
  HAND_MADE,
  handMadeBytes,
  missingForModule,
  playStream,
  waitFor,
} from './wasm-hook.ts'

const FIRST = 'smogtours-gen3ou-994052'
const LINKED = 'smogtours-gen3ou-994176'

test('a replay loaded by link in the viewer lists what the emulator page lists', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/')
  const summary = page.locator('#replay-summary')
  const status = page.getByRole('status')
  await expect(summary).toHaveText(labelOf(FIRST))
  await expect(status).toHaveText(/^Pick your US Emerald dump/)

  await loadReplay(page, 'https://example.com/smogtours-gen3ou-994176')
  await expect(status).toHaveText(/^"Replay link or ID" takes a replay ID such as /)
  await expect(summary).toHaveText(labelOf(FIRST))

  await loadReplay(page, `https://replay.pokemonshowdown.com/${LINKED}`)
  await expect(summary).toHaveText(labelOf(LINKED))
  await expect(page.locator('#replay-detail')).toHaveText(COUNTS)
  await expect(status).toHaveText(`Picked ${labelOf(LINKED)}. Press Start to play it.`)
  await expect(page.getByLabel('Example replay')).toHaveValue('')
  const onWasm = await notShownList(page)
  expect(await notShownCount(page)).toBeGreaterThan(0)
  expect(onWasm.rows).toHaveLength(await notShownCount(page))

  await page.goto('/emulator.html')
  await loadReplay(page, LINKED)
  await expect(summary).toHaveText(labelOf(LINKED))
  expect(await notShownList(page)).toEqual(onWasm)
  expect(notSameOriginGets).toEqual([`GET ${showdownUrl(LINKED)}`, `GET ${showdownUrl(LINKED)}`])
})

test('a test replay picked in the viewer shows its list and asks for Start, and the pages link each other', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  const second = 'smogtours-gen3ou-994086'
  await page.getByLabel('Example replay').selectOption(second)
  await expect(page.getByRole('status')).toHaveText(
    `Picked ${labelOf(second)}. Press Start to play it.`,
  )
  await expect(page.locator('#replay-summary')).toHaveText(labelOf(second))

  await test.step('the viewer links the emulator page as the fallback, and it links back', async () => {
    await page.getByRole('link', { name: 'emulator page' }).click()
    await expect(page).toHaveURL(/\/emulator\.html$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/emulator page$/)
    await page.getByRole('link', { name: 'viewer' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByLabel('Fast')).toBeVisible()
  })

  await test.step('the viewer links its licence page, and it links back', async () => {
    await page.getByRole('link', { name: 'Licences' }).click()
    await expect(page).toHaveURL(/\/licences\.html$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/licences$/)
    await expect(page.getByText('Permission is hereby granted, free of charge')).toBeVisible()
    await page.getByRole('link', { name: 'Back to the viewer' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
  expect(notSameOriginGets).toEqual([])
})

// #50 with the module: the replay loaded by link starts at fast, as Start plays what the list
// describes, and the game works through its instructions. e2e/wasm-play.spec.ts covers END at fast.
test('a replay loaded by link starts at fast in the viewer and plays its instructions', async ({
  page,
  baseURL,
}) => {
  const missing = missingForModule()
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run ${WASM_BUILD_STEPS}, or set IRV_BASE_ROM`,
  )
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, LINKED)
  await page.goto('/')
  const line = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(/^Your dump is US Emerald/, { timeout: 180_000 })
  await loadReplay(page, LINKED)
  await expect(line).toHaveText(`Picked ${labelOf(LINKED)}. Press Start to play it.`)
  const listed = /^(\d+) instructions/.exec(await detailText(page, 'replay-detail'))

  await page.getByLabel('Fast').check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(line).toHaveText(startsWith(`Running ${labelOf(LINKED)}.`))
  const now = await waitFor(page, (run) => run.done > 0, 120_000)
  expect(now.speed).toBe('fast')
  expect(now.finished).toBe(false)
  expect(now.done).toBeLessThan(now.total)
  expect(String(now.total)).toBe(listed?.[1])
  await expect(page.locator('#progress')).toHaveText(/^Frame \d+, instruction [1-9]\d* of \d+/)
  expect((await frame(page)).colours).toBeGreaterThan(1)
  expect(notSameOriginGets).toEqual([`GET ${showdownUrl(LINKED)}`])
  expect(errors).toEqual([])
})

// An AudioContext whose resume() rejects; the e2e's tsconfig knows no DOM, so the script is text.
const REFUSING_AUDIO =
  'globalThis.AudioContext = class extends AudioContext {' +
  "resume() { return Promise.reject(new Error('refused for the test')) } }"

// #59: the END line replaces the running line, so a run without sound keeps the reason there. The
// page's AudioContext refuses to resume, as a browser that blocks the page's sound does.
test('a run without sound keeps the reason in its END line', async ({ page, baseURL }) => {
  const missing = missingForModule()
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run ${WASM_BUILD_STEPS}, or set IRV_BASE_ROM`,
  )
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.addInitScript(REFUSING_AUDIO)
  await page.goto('/')
  const line = page.getByRole('status')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(/^Your dump is US Emerald/, { timeout: 180_000 })

  await page.getByLabel('Fast').check()
  await playStream(page, HAND_MADE, await handMadeBytes())
  const reason = 'the audio did not start: refused for the test'
  const end = await finished(page, 180_000)
  expect(end.audio.silence).toBe(reason)
  await expect(line).toHaveText(
    `Played ${HAND_MADE} to the end of the battle. It played without sound: ${reason}.`,
  )
  expect(notSameOriginGets).toEqual([])
  expect(errors).toEqual([])
})
