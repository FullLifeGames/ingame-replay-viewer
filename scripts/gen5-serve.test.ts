import type { IncomingMessage, ServerResponse } from 'node:http'

import { describe, expect, it } from 'vitest'

import { isFileLoadingAllowed, resolveConfig } from 'vite'

import { archiveName, SOURCES } from './gen5-manifest'
import { GEN5_PATHS } from './gen5-paths'
import { gen5ServerConfig, licencesMount, unpackerMount } from './gen5-serve'
import { UNPACKER_PATH } from '../src/gen5/core-unpack'

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

/** Runs `url` through the unpacker's mount with an invented script; gives the answer once it
 * ends, or 'next'. */
function answerScript(url: string, script: () => Promise<string>) {
  return new Promise<{ status: number; type: string; body: string; next: boolean }>((resolve) => {
    const got = { status: 0, type: '', body: '', next: false }
    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        got.status = status
        got.type = headers['Content-Type'] ?? ''
      },
      end(body: string) {
        got.body = body
        resolve(got)
      },
    }
    unpackerMount(script)(
      { url } as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      () => {
        got.next = true
        resolve(got)
      },
    )
  })
}

// Scene: the dev server answers the page's unpacker as the build writes it, one classic script.
describe('unpackerMount', () => {
  it("answers the unpacker's path with the bundled script as JavaScript", async () => {
    expect(await answerScript(`${UNPACKER_PATH}?v=1`, () => Promise.resolve('(()=>{})()'))).toEqual(
      {
        status: 200,
        type: 'text/javascript',
        body: '(()=>{})()',
        next: false,
      },
    )
  })

  it('answers 500 with the reason when the script cannot be bundled', async () => {
    const failing = () => Promise.reject(new Error('extract7z.ts: no such file'))
    expect(await answerScript(UNPACKER_PATH, failing)).toMatchObject({
      status: 500,
      body: 'gen5: extract7z.ts: no such file',
    })
  })

  it('passes every other path on', async () => {
    const script = () => Promise.resolve('')
    expect(await answerScript('/emulatorjs/data/compression/extract7z.js', script)).toMatchObject({
      next: true,
      status: 0,
    })
  })
})

// Scene: Vite's own paths (/@fs/, ?raw) reach no fetched file and no build output (review).
describe("the dev server's deny list", () => {
  const archives = SOURCES.map((source) => `${GEN5_PATHS.sources}/${archiveName(source)}`)

  it('refuses the source archives, the bare repositories, the build and a save', async () => {
    const config = await resolveConfig(gen5ServerConfig(false), 'serve')
    const files = [
      ...archives,
      `${GEN5_PATHS.sources}/git/melonds.git/HEAD`,
      `${GEN5_PATHS.site}/data/version.json`,
      `${GEN5_PATHS.built}/licences.html`,
      `${GEN5_PATHS.saves}/route-20.sav`,
    ]
    expect(files.filter((file) => isFileLoadingAllowed(config, file))).toEqual([])
    expect(isFileLoadingAllowed(config, `${GEN5_PATHS.page}/index.html`)).toBe(true)
  })
})
