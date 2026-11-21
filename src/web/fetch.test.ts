import { describe, expect, it } from 'vitest'

import { fetchBytes, FetchError, fetchJson } from './fetch'

/** A stand-in for the browser's fetch that answers every URL with `response` and logs the URL. */
function answering(response: Response | Error) {
  const urls: string[] = []
  const fetcher = (url: string): Promise<Response> => {
    urls.push(url)
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  }
  return { urls, fetcher }
}

const MISSING = 'build/rom/irv-emerald.bps is missing: run npm run rom:build'

describe('fetchBytes', () => {
  it('gives the bytes of a 200 answer', async () => {
    const { urls, fetcher } = answering(new Response(Uint8Array.of(1, 2, 3)))
    expect(await fetchBytes('rom/irv-emerald.bps', fetcher)).toEqual(Uint8Array.of(1, 2, 3))
    expect(urls).toEqual(['rom/irv-emerald.bps'])
  })

  // The dev server answers 404 with one plain line when build/rom/ lacks the patch.
  it("refuses a 404 with the server's own line", async () => {
    const { fetcher } = answering(new Response(`${MISSING}\n`, { status: 404 }))
    const refusal = fetchBytes('rom/irv-emerald.bps', fetcher)
    await expect(refusal).rejects.toThrow(FetchError)
    await expect(refusal).rejects.toThrow(`rom/irv-emerald.bps answered 404: ${MISSING}`)
  })

  it('keeps the first line of a long error page, cut to 200 characters', async () => {
    const page = `${'x'.repeat(300)}\nsecond line`
    const { fetcher } = answering(new Response(page, { status: 500 }))
    await expect(fetchBytes('rom/irv-emerald.bps', fetcher)).rejects.toThrow(
      new FetchError(`rom/irv-emerald.bps answered 500: ${'x'.repeat(200)}`),
    )
  })

  it('names the status alone when the answer has no text', async () => {
    const { fetcher } = answering(new Response(null, { status: 503 }))
    await expect(fetchBytes('rom/irv-emerald.bps', fetcher)).rejects.toThrow(
      new FetchError('rom/irv-emerald.bps answered 503'),
    )
  })

  // The dev server stopped, or the network is down: the browser's fetch rejects.
  it('names the URL when the request fails', async () => {
    const { fetcher } = answering(new TypeError('Failed to fetch'))
    await expect(fetchBytes('rom/irv-emerald.bps', fetcher)).rejects.toThrow(
      new FetchError('rom/irv-emerald.bps could not be fetched: Failed to fetch'),
    )
  })

  it("uses the browser's fetch by default", async () => {
    await expect(fetchBytes('http://127.0.0.1:1/rom/irv-emerald.bps')).rejects.toThrow(
      /^http:\/\/127\.0\.0\.1:1\/rom\/irv-emerald\.bps could not be fetched: /,
    )
  })
})

describe('fetchJson', () => {
  it('gives the parsed JSON of a 200 answer', async () => {
    const { fetcher } = answering(Response.json({ slotVersion: 1 }))
    expect(await fetchJson('rom/replay-slot.json', fetcher)).toEqual({ slotVersion: 1 })
  })

  it('refuses an answer that is not JSON', async () => {
    const { fetcher } = answering(new Response('<!doctype html>'))
    const refusal = fetchJson('rom/replay-slot.json', fetcher)
    await expect(refusal).rejects.toThrow(FetchError)
    await expect(refusal).rejects.toThrow(/^rom\/replay-slot\.json did not answer with JSON: /)
  })

  // Showdown answers an unknown replay ID with 404.
  it('refuses a 404 like fetchBytes', async () => {
    const url = 'https://replay.pokemonshowdown.com/gen3ou-1.json'
    const { fetcher } = answering(new Response('404 Not Found', { status: 404 }))
    await expect(fetchJson(url, fetcher)).rejects.toThrow(
      new FetchError(`${url} answered 404: 404 Not Found`),
    )
  })

  it("uses the browser's fetch by default", async () => {
    await expect(fetchJson('http://127.0.0.1:1/rom/replay-slot.json')).rejects.toThrow(FetchError)
  })
})
