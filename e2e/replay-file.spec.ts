// A replay from a saved file in the viewer at / (#56): each kind the reader knows, built from the
// test fixture as Showdown saves it, fills the list as the same replay loaded by link does. The
// file stays in the tab, so the link's request to Showdown is the only one that leaves the page,
// and a route answers it from the fixture.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { REPO_DIR } from '../scripts/rom-paths.ts'
import { readReplay } from '../src/script/replay.ts'
import { downloadedFile, jsonFile, rawLog, replayPage } from '../src/script/saved-replay-testing.ts'
import { notShownList } from './page-text.ts'
import { guardRequests } from './requests.ts'
import { loadReplay, routeShowdown, showdownUrl } from './showdown.ts'

const FIRST = 'smogtours-gen3ou-994052'
const OTHER = 'smogtours-gen3ou-994086'
const REPLAY = readReplay(
  JSON.parse(readFileSync(join(REPO_DIR, 'test', 'fixtures', 'replays', `${FIRST}.json`), 'utf8')),
)

interface SavedFile {
  readonly name: string
  readonly mimeType: string
  readonly text: string
}

const DOWNLOADED: SavedFile = {
  name: `${FIRST}.html`,
  mimeType: 'text/html',
  text: downloadedFile(REPLAY),
}

// The raw log takes its id from the file name, so its name is the replay's id.
const FILES: readonly SavedFile[] = [
  DOWNLOADED,
  { name: 'Replay page.html', mimeType: 'text/html', text: replayPage(REPLAY) },
  { name: `${FIRST}.log`, mimeType: 'text/plain', text: rawLog(REPLAY) },
  { name: `${FIRST}.json`, mimeType: 'application/json', text: jsonFile(REPLAY) },
]

async function pickFile(page: Page, file: SavedFile): Promise<void> {
  await page.locator('#replay-file').setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: Buffer.from(file.text),
  })
}

test('each kind of saved file fills the list as the replay loaded by link does', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await routeShowdown(page, FIRST)
  await page.goto('/')
  const status = page.getByRole('status')
  const testReplay = page.locator('#test-replay')
  await expect(page.locator('#replay-summary')).toHaveText(new RegExp(`^${FIRST}: `))

  await loadReplay(page, `https://replay.pokemonshowdown.com/${FIRST}`)
  await expect(status).toHaveText(`Picked ${FIRST}. Press Start to play it.`)
  const byLink = await notShownList(page)
  expect(byLink.rows.length).toBeGreaterThan(0)

  for (const file of FILES) {
    // A pick between the files changes the status, so each file's own line shows.
    await testReplay.selectOption(OTHER)
    await expect(status).toHaveText(`Picked ${OTHER}. Press Start to play it.`)
    await pickFile(page, file)
    await expect(status, file.name).toHaveText(`Picked ${FIRST}. Press Start to play it.`)
    await expect(testReplay, file.name).toHaveValue('')
    expect(await notShownList(page), file.name).toEqual(byLink)
  }
  expect(notSameOriginGets).toEqual([`GET ${showdownUrl(FIRST)}`])
})

test('a file of no kind the viewer reads leaves the list on the replay the page holds', async ({
  page,
  baseURL,
}) => {
  const notSameOriginGets = await guardRequests(page, baseURL)
  await page.goto('/')
  const status = page.getByRole('status')
  await expect(page.locator('#replay-summary')).toHaveText(new RegExp(`^${FIRST}: `))
  const before = await notShownList(page)

  await pickFile(page, { name: 'notes.txt', mimeType: 'text/plain', text: 'Bring snacks.\n' })
  await expect(status).toHaveText(/^Could not read the replay file notes\.txt: /)
  expect(await notShownList(page)).toEqual(before)
  await expect(page.locator('#test-replay')).toHaveValue(FIRST)

  // The input forgets each file it read, so the same file picked again fires a change.
  await pickFile(page, DOWNLOADED)
  await expect(status).toHaveText(`Picked ${FIRST}. Press Start to play it.`)
  await expect(page.locator('#replay-file')).toHaveValue('')
  expect(notSameOriginGets).toEqual([])
})
