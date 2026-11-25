import type { IncomingMessage, ServerResponse } from 'node:http'

import { describe, expect, it } from 'vitest'

import { licencesMount } from './gen5-serve'

/** Runs `url` through the mount with an invented page; gives the answer, or 'next'. */
function answer(url: string, page: () => string) {
  const got = { status: 0, type: '', body: '', next: false }
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      got.status = status
      got.type = headers['Content-Type'] ?? ''
    },
    end(body: string) {
      got.body = body
    },
  }
  licencesMount(page)(
    { url } as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    () => {
      got.next = true
    },
  )
  return got
}

// Scene: the dev server answers the licences page as the build writes it (#79).
describe('licencesMount', () => {
  it('answers /licences.html with the page as HTML', () => {
    expect(answer('/licences.html', () => '<h1>invented</h1>')).toMatchObject({
      status: 200,
      type: 'text/html',
      body: '<h1>invented</h1>',
    })
  })

  it('answers 500 with the reason when the page cannot be made', () => {
    const page = () => {
      throw new Error('run node scripts/gen5-sources.ts first')
    }
    expect(answer('/licences.html', page)).toMatchObject({
      status: 500,
      body: 'gen5: run node scripts/gen5-sources.ts first',
    })
  })

  it('passes every other path on', () => {
    expect(answer('/index.html', () => '')).toMatchObject({ next: true, status: 0 })
  })
})
