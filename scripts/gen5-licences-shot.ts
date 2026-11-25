// The Gen 5 page's notice and licences page in a browser (#79), with no dump and no emulator:
// builds and serves the page (scripts/gen5-built.ts, which writes licences.html from the pinned
// sources), saves the page at a phone's 360 px width and the licences page as frames into
// build/gen5/frames/ (gitignored, ADR 0002), checks that the notice stands above the file input
// and that no page is wider than the screen, then sends HEAD to every /source/ link the licences
// page holds and logs each answer and size. Any answer but 200, or a size other than the
// archive's, fails the run.
// Usage: node scripts/gen5-licences-shot.ts
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { chromium, type Page } from '@playwright/test'

import { LICENCES_PAGE, SOURCE_PREFIX } from './gen5-files.ts'
import { log } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { watchRequests } from './gen5-requests.ts'
import { CHROMIUM_ARGS, PAGE_HOST, serve } from './gen5-shot.ts'

const PHONE = { width: 360, height: 800 }
const LABEL = 's79-3'

async function frame(page: Page, name: string, fullPage: boolean): Promise<void> {
  const path = join(GEN5_PATHS.frames, `${LABEL}-${name}.png`)
  await page.screenshot({ path, fullPage })
  log(`frame ${LABEL}-${name}.png (${String(PHONE.width)} px${fullPage ? ', whole page' : ''})`)
}

/** Logs whether the page is wider than the screen; true when it is. */
async function overflows(page: Page, name: string): Promise<boolean> {
  const root = 'document.documentElement'
  const [scroll, client] = await page.evaluate<[number, number]>(
    `[${root}.scrollWidth, ${root}.clientWidth]`,
  )
  const widths = { scroll, client }
  const wide = widths.scroll > widths.client
  log(
    `${name}: ${String(widths.scroll)} px of content in ${String(widths.client)} px${wide ? ', FAULT: wider than the screen' : ', no overflow'}`,
  )
  return wide
}

/** Saves the page with its notice; false unless the notice stands above the file input. */
async function noticePage(page: Page): Promise<boolean> {
  await page.locator('#licence-notice').waitFor()
  await frame(page, 'notice', true)
  const notice = await page.locator('#licence-notice').boundingBox()
  const input = await page.locator('#dump').boundingBox()
  const above = notice !== null && input !== null && notice.y + notice.height <= input.y
  log(
    `notice: ${above ? 'above' : 'FAULT: not above'} the file input (notice ${JSON.stringify(notice)}, input ${JSON.stringify(input)})`,
  )
  return above && !(await overflows(page, 'page'))
}

interface Licences {
  /** The page answered 200 and is no wider than the screen. */
  good: boolean
  /** Its /source/ links, each once. */
  hrefs: string[]
}

/** The parts of the licences page saved as frames, each at the top of the screen: the two lists,
 * the row of the page's own unpacker, libretro-common's notices and its files without one. */
const SECTIONS: readonly (readonly [string, string])[] = [
  ['files', '#files'],
  ['sources', '#sources'],
  ['unpacker', 'tr[data-own="unpacker"]'],
  ['libretro-common', 'h4:text-is("libretro-common")'],
  ['no-notice', 'p.from:has-text("No notice in the file")'],
]

/** Follows the notice's link and saves the licences page's first screen and its SECTIONS. */
async function licencesPage(page: Page): Promise<Licences> {
  const [response] = await Promise.all([
    page.waitForResponse((answer) => answer.url().endsWith(`/${LICENCES_PAGE}`)),
    page.click('#licence-notice a'),
  ])
  await page.waitForURL(`**/${LICENCES_PAGE}`)
  log(`licences page: ${String(response.status())} ${page.url()}`)
  await frame(page, 'licences-top', false)
  for (const [name, selector] of SECTIONS) {
    const box = await page.locator(selector).first().boundingBox()
    await page.evaluate(`window.scrollBy(0, ${String(box?.y ?? 0)})`)
    await frame(page, `licences-${name}`, false)
  }
  const wide = await overflows(page, 'licences page')
  const hrefs: string[] = []
  for (const link of await page.locator(`a[href^="${SOURCE_PREFIX}"]`).all()) {
    hrefs.push((await link.getAttribute('href')) ?? '')
  }
  return { good: response.status() === 200 && !wide, hrefs: [...new Set(hrefs)] }
}

/** HEAD for each /source/ link; false unless each answers 200 with its archive's size. */
async function headSources(port: number, hrefs: readonly string[]): Promise<boolean> {
  let good = hrefs.length > 0
  for (const href of hrefs) {
    const response = await fetch(`http://127.0.0.1:${String(port)}${href}`, { method: 'HEAD' })
    const length = response.headers.get('content-length')
    const file = statSync(join(GEN5_PATHS.sources, href.slice(SOURCE_PREFIX.length)), {
      throwIfNoEntry: false,
    })
    const ok = response.status === 200 && length === String(file?.size)
    log(
      `HEAD ${href}: ${String(response.status)}, ${String(length)} bytes${ok ? '' : `, FAULT (archive ${String(file?.size)} bytes)`}`,
    )
    good &&= ok
  }
  log(
    `sources: ${String(hrefs.length)} links, ${good ? 'each answered 200 with its size' : 'FAULT'}`,
  )
  return good
}

async function main(): Promise<void> {
  mkdirSync(GEN5_PATHS.frames, { recursive: true })
  const served = await serve(true)
  const origin = `http://${PAGE_HOST}:${String(served.port)}`
  const browser = await chromium.launch({ args: CHROMIUM_ARGS })
  try {
    const page = await browser.newPage({ viewport: PHONE })
    const requests = watchRequests(page, origin, true)
    await page.goto(`${origin}/`)
    const notice = await noticePage(page)
    const licences = await licencesPage(page)
    const sources = await headSources(served.port, licences.hrefs)
    log(requests.summary())
    process.exitCode = notice && licences.good && sources && !requests.failed ? 0 : 1
  } finally {
    await browser.close()
    await served.close()
  }
}

if (import.meta.main) await main()
