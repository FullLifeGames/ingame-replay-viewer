// The viewer's Pause and Play (#57) in Chromium. Each test reads the user's US Emerald by the
// build's rule and skips without it or without the module. A pause holds the hand-made battle's
// frame and its sound counts, and Play takes the battle to the END frame an unpaused run reaches.
// Start plays a replay picked during a run, and during a pause too, and a Play refused its sound
// after such a pick keeps the pick's line. A mouse click on Start hands the focus to Pause once the
// run begins, so Space pauses that run. Space toggles the pause on the page's body and through the
// focused button, and leaves a focused radio its own use. The tests leave 994086 within its first
// seconds; no request leaves the page.
import { expect, type Page, test } from '@playwright/test'

import { WASM_BUILD_STEPS } from '../scripts/wasm-link.ts'
import { labelOf, startsWith } from './page-text.ts'
import { guardRequests } from './requests.ts'
import {
  DUMP,
  finished,
  HAND_MADE,
  handMadeBytes,
  missingForModule,
  playStream,
  REFUSING_AUDIO,
  report,
  status,
  waitFor,
} from './wasm-hook.ts'

const FIRST = 'smogtours-gen3ou-994052'
const OTHER = 'smogtours-gen3ou-994086'

// The hand-made battle starts through the test hook, with no click, so the page may open its audio.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

const pauseButton = (page: Page) => page.locator('#pause')

/** The current run's status; a test reads it only while a run exists. */
async function read(page: Page) {
  const now = await status(page)
  if (now === undefined) throw new Error('the page has no run')
  return now
}

/**
 * Skips without the dump or the module, opens the viewer and builds the game from the dump. Returns
 * the page's errors and the requests that left it (`guardRequests`); each test ends with both empty.
 */
async function openWithDump(page: Page, baseURL: string | undefined) {
  const missing = missingForModule()
  test.skip(
    missing.length > 0,
    `missing ${missing.join(', ')}; run ${WASM_BUILD_STEPS}, or set IRV_BASE_ROM`,
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const requests = await guardRequests(page, baseURL)
  await page.goto('/')
  // Before the first run the button reads "Pause" and does nothing.
  await expect(pauseButton(page)).toHaveText('Pause')
  await expect(pauseButton(page)).toBeDisabled()
  await page.getByLabel('Your US Emerald (stays in this tab)').setInputFiles(DUMP)
  await expect(page.getByRole('status')).toHaveText(/^Your dump is US Emerald/, {
    timeout: 180_000,
  })
  return { errors, requests }
}

/** Picks the example replay `id`, presses Start and waits for its running line. */
async function startReplay(page: Page, id: string): Promise<void> {
  await page.locator('#test-replay').selectOption(id)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText(startsWith(`Running ${labelOf(id)}.`), {
    timeout: 60_000,
  })
}

/**
 * Waits until two reads 200 ms apart give the same frame, and returns the later read: the worker
 * may hand over one frame past the held grant before it stands.
 */
async function standing(page: Page) {
  let before = await read(page)
  await expect
    .poll(
      async () => {
        const now = await read(page)
        const same = now.frame === before.frame
        before = now
        return same
      },
      { timeout: 10_000, intervals: [200] },
    )
    .toBe(true)
  return before
}

test('Pause holds the hand-made battle at 1x for 3 s, and Play reaches the END of an unpaused run', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(480_000)
  const { errors, requests } = await openWithDump(page, baseURL)
  const handMade = await handMadeBytes()
  const pause = pauseButton(page)

  const unpaused = await test.step('the hand-made battle reaches END at fast', async () => {
    await page.getByLabel('Fast').check()
    await playStream(page, HAND_MADE, handMade)
    const end = await finished(page, 180_000)
    await expect(page.getByLabel('1x')).toBeChecked()
    // A finished battle has nothing left to hold: the button rests as before a run.
    await expect(pause).toHaveText('Pause')
    await expect(pause).toBeDisabled()
    return end.finishedAt
  })

  const held = await test.step('Pause after 3 s at 1x holds the frame and the sound', async () => {
    await playStream(page, HAND_MADE, handMade)
    await page.waitForTimeout(3_000)
    await expect(pause).toHaveText('Pause')
    await pause.click()
    await expect(pause).toHaveText('Play')
    const before = await standing(page)
    await page.waitForTimeout(3_000)
    const after = await read(page)
    const counts = (now: typeof after) => [now.frame, now.audio.underruns, now.audio.overruns]
    report({ stream: HAND_MADE, pausedAt: before.frame, standsAt: after.frame })
    expect(counts(after)).toEqual(counts(before))
    expect(after.paused).toBe(true)
    expect(after.audio.state).toBe('suspended')
    await expect(pause).toHaveText('Play')
    return after
  })

  await test.step('Play goes on from the held frame and reaches the same END', async () => {
    await pause.click()
    await expect(pause).toHaveText('Pause')
    await waitFor(page, (now) => now.frame > held.frame, 10_000)
    const played = await read(page)
    expect(played.audio.state).toBe('running')
    // The ring kept its samples across the pause, so Play counts no dry spell (#57).
    report({
      stream: HAND_MADE,
      underrunsHeld: held.audio.underruns,
      played: played.audio.underruns,
    })
    expect(played.audio.underruns).toBe(held.audio.underruns)
    // A pause leaves the frames the game plays as they were, so fast takes it to the same END.
    await page.getByLabel('Fast').check()
    const end = await finished(page, 180_000)
    report({ stream: HAND_MADE, unpaused, paused: end.finishedAt })
    expect(end.done).toBe(end.total)
    expect(end.finishedAt).toBe(unpaused)
  })
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('Start plays a replay picked during a run', async ({ page, baseURL }) => {
  test.setTimeout(300_000)
  const { errors, requests } = await openWithDump(page, baseURL)
  await startReplay(page, FIRST)
  await waitFor(page, (now) => now.frame > 60, 30_000)
  await startReplay(page, OTHER)
  await expect(pauseButton(page)).toHaveText('Pause')
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('a pick during a pause leaves the run paused, and Start plays the pick', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const { errors, requests } = await openWithDump(page, baseURL)
  const pause = pauseButton(page)
  await startReplay(page, FIRST)
  await waitFor(page, (now) => now.frame > 60, 30_000)
  await pause.click()
  await expect(pause).toHaveText('Play')
  const held = await standing(page)
  await page.locator('#test-replay').selectOption(OTHER)
  await expect(page.locator('#panel-far')).toHaveText('Far side: Halbert Simpson')
  await page.waitForTimeout(2_000)
  const after = await read(page)
  expect([after.frame, after.paused]).toEqual([held.frame, true])
  await expect(pause).toHaveText('Play')

  await startReplay(page, OTHER)
  await expect(pause).toHaveText('Pause')
  expect((await read(page)).paused).toBe(false)
  // Start opens the sound again inside its click, so the new run plays with it.
  await expect.poll(async () => (await read(page)).audio.state).toBe('running')
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

// #90 D4: Play asks for the sound again. A refusal writes the running line with its reason, but
// while the page shows another pick, "Picked …" stays: the next Start makes that pick's own run.
test('a Play refused its sound keeps the line of a pick made during the pause', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000)
  await page.addInitScript(REFUSING_AUDIO)
  const { errors, requests } = await openWithDump(page, baseURL)
  const pause = pauseButton(page)
  const line = page.getByRole('status')
  await startReplay(page, FIRST)
  await waitFor(page, (now) => now.frame > 60, 30_000)
  await pause.click()
  await expect(pause).toHaveText('Play')
  // Without a pick, the refused Play says so.
  await pause.click()
  await expect(line).toHaveText(
    `Running ${labelOf(FIRST)}. It plays without sound: the audio did not resume.`,
  )
  await pause.click()
  await expect(pause).toHaveText('Play')
  await page.locator('#test-replay').selectOption(OTHER)
  const picked = `Picked ${labelOf(OTHER)}. Press Start to play it.`
  await expect(line).toHaveText(picked)
  await pause.click()
  await expect(pause).toHaveText('Pause')
  await expect.poll(async () => (await read(page)).paused).toBe(false)
  // The refusal settles within a task; the line still names the pick a second later.
  await page.waitForTimeout(1_000)
  await expect(line).toHaveText(picked)
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

/** What the page's window offers to `page.evaluate`; the e2e compiles without the DOM types. */
interface PageWindow {
  document: { activeElement: { blur(): void } | null }
}

test('Space pauses the run a click on Start began, toggles on the body and through the button, and leaves a radio its own use', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const { errors, requests } = await openWithDump(page, baseURL)
  const pause = pauseButton(page)
  const paused = async () => (await read(page)).paused
  await expect(page.getByLabel('1x')).toBeChecked()
  await startReplay(page, FIRST)
  await waitFor(page, (now) => now.frame > 60, 30_000)
  const before = await read(page)

  // The mouse click leaves the focus on Start, and the run's begin moves it to Pause (S5-17), so
  // Space pauses the run instead of starting it over.
  await page.keyboard.press('Space')
  await expect.poll(paused).toBe(true)
  const held = await standing(page)
  report({ stream: FIRST, spaceAfterStartAt: before.frame, standsAt: held.frame })
  expect(held.frame).toBeGreaterThanOrEqual(before.frame)
  expect(held.runs).toEqual(before.runs)
  await expect(pause).toBeFocused()
  await page.keyboard.press('Space')
  await expect.poll(paused).toBe(false)

  // With no focus the key goes to the body.
  await page.evaluate(() => {
    ;(globalThis as unknown as PageWindow).document.activeElement?.blur()
  })
  await page.keyboard.press('Space')
  await expect.poll(paused).toBe(true)
  await page.keyboard.press('Space')
  await expect.poll(paused).toBe(false)

  await pause.focus()
  await page.keyboard.press('Space')
  await expect.poll(paused).toBe(true)
  await expect(pause).toHaveText('Play')

  const twice = page.getByLabel('2x')
  await twice.focus()
  await page.keyboard.press('Space')
  await expect(twice).toBeChecked()
  await expect.poll(async () => (await read(page)).speed).toBe('2x')
  expect(await paused()).toBe(true)
  await expect(pause).toHaveText('Play')
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})
