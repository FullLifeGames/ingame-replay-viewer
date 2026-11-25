// Keeps a test's requests on the test's own server: a request to another origin is aborted
// unless the test fulfils it with its own route (registered later, so it runs first), and every
// request that is not a same-origin GET is listed for the test to check.
import type { Page } from '@playwright/test'

export async function guardRequests(page: Page, baseURL: string | undefined): Promise<string[]> {
  if (baseURL === undefined) throw new Error('playwright.config.ts sets no baseURL')
  const origin = new URL(baseURL).origin
  const listed: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== origin || request.method() !== 'GET') {
      listed.push(`${request.method()} ${request.url()}`)
    }
  })
  await page.route(
    (url) => url.origin !== origin,
    (route) => route.abort('blockedbyclient'),
  )
  return listed
}
