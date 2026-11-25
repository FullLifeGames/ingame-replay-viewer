// The panel above the game (#58): the two players by side and the turn the game has reached, on a
// phone-wide screen. The names come from other people's replays, so the panel writes them as text
// and wraps a long one. With the dump and the module, the panel's turn follows the game's turn
// word at fast, and a pick during the run asks for Start in place of the running battle's turn.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'
import { WASM_BUILD_STEPS } from '../scripts/wasm-link.ts'
import { readReplay } from '../src/script/replay.ts'
import { rawLog } from '../src/script/saved-replay-testing.ts'
import { scrollWidth } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { DUMP, missingForModule, report, waitFor } from './wasm-hook.ts'

const FIRST = 'smogtours-gen3ou-994052'
const OTHER = 'smogtours-gen3ou-994086'
const WIDTH = 360
const PRESS_START = 'Press Start to play it.'

test.use({ viewport: { width: WIDTH, height: 740 } })

const panel = (page: Page) => ({
  far: page.locator('#panel-far'),
  near: page.locator('#panel-near'),
  turn: page.locator('#panel-turn'),
})

/** What the page's window offers to `page.evaluate`; the e2e compiles without the DOM types. */
interface PageWindow {
  document: {
    getElementById(id: string): { textContent: string | null } | null
  }
  requestAnimationFrame(callback: () => void): number
  irvWasmViewer: { status(): { turn: number } | undefined }
}

/** The panel's turn and the hook's, read in one animation frame after the page's own draw. */
const sampleTurn = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ panel: string; hook: number | undefined }>((resolve) => {
        const window = globalThis as unknown as PageWindow
        window.requestAnimationFrame(() => {
          resolve({
            panel: window.document.getElementById('panel-turn')?.textContent ?? '',
            hook: window.irvWasmViewer.status()?.turn,
          })
        })
      }),
  )

test('the panel names the first pick by side and fits a phone-wide screen', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  const { far, near, turn } = panel(page)
  await expect(far).toHaveText('Far side: xXEricXx')
  await expect(near).toHaveText('Near side: A Welcome Guest')
  await expect(turn).toHaveText(PRESS_START)
  expect.soft(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)

  await page.getByLabel('Example replay').selectOption(OTHER)
  await expect(far).toHaveText('Far side: Halbert Simpson')
  await expect(near).toHaveText('Near side: dataexpunged')
  expect(notSameOriginGets).toEqual([])
})

// Showdown allows 18 characters in a name: the widest letter 18 times gives the panel no space to
// break at. The game's name field refuses more than 19 glyphs, so a longer name never plays.
test('the panel writes names from a file as text and wraps a long one', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  const long = 'W'.repeat(18)
  const markup = '<img id=injected>'
  const replay = readReplay(
    JSON.parse(
      readFileSync(join(REPO_DIR, 'test', 'fixtures', 'replays', `${FIRST}.json`), 'utf8'),
    ),
  )
  const log = replay.log.replaceAll('A Welcome Guest', long).replaceAll('xXEricXx', markup)
  await page.goto('/')
  await expect(panel(page).far).toHaveText('Far side: xXEricXx')
  await page.locator('#replay-file').setInputFiles({
    name: 'long-names.log',
    mimeType: 'text/plain',
    buffer: Buffer.from(rawLog({ ...replay, log })),
  })
  await expect(page.getByRole('status')).toHaveText('Picked long-names. Press Start to play it.')
  await expect(panel(page).far).toHaveText(`Far side: ${markup}`)
  await expect(panel(page).near).toHaveText(`Near side: ${long}`)
  expect(await page.locator('#injected').count()).toBe(0)
  expect(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)
  expect(notSameOriginGets).toEqual([])
})

test('the panel follows the game turn by turn and asks for Start after another pick', async ({
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
  await page.goto('/')
  const line = page.getByRole('status')
  const { far, near, turn } = panel(page)
  await expect(far).toHaveText('Far side: xXEricXx')
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(line).toHaveText(/^Your dump is US Emerald/, { timeout: 180_000 })

  await page.getByLabel('Fast').check()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(line).toHaveText(new RegExp(`^Running ${FIRST}`))
  await waitFor(page, (run) => run.turn >= 1, 120_000)
  const samples: { panel: string; hook: number | undefined }[] = []
  for (let sample = 0; sample < 5; sample += 1) {
    if (sample > 0) await page.waitForTimeout(2000)
    samples.push(await sampleTurn(page))
  }
  report({ panelTurns: samples.map((one) => `${one.panel}/${String(one.hook)}`).join(', ') })
  for (const one of samples) expect(one.panel).toBe(`Turn ${String(one.hook)}`)
  const turns = samples.map((one) => one.hook ?? 0)
  expect(turns.at(-1)).toBeGreaterThan(turns[0] ?? 0)
  expect(await scrollWidth(page)).toBeLessThanOrEqual(WIDTH)

  await page.getByLabel('Example replay').selectOption(OTHER)
  await expect(far).toHaveText('Far side: Halbert Simpson')
  await expect(near).toHaveText('Near side: dataexpunged')
  await expect(turn).toHaveText(PRESS_START)
  expect(errors).toEqual([])
  expect(notSameOriginGets).toEqual([])
})
