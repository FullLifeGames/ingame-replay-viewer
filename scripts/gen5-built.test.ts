import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BUILT_PORT, builtServerOptions, startBuiltServer } from './gen5-built'
import { writeLicencesPage } from './gen5-licences-read'
import { archiveName, COMPONENTS, SITE_FILES } from './gen5-manifest'
import { GEN5_PATHS } from './gen5-paths'

describe('builtServerOptions', () => {
  it('binds to loopback on port 5184 unless told otherwise', () => {
    expect(BUILT_PORT).toBe(5184)
    expect(builtServerOptions(['--built'])).toEqual({ host: false, port: 5184 })
  })

  it('reads --host and --port', () => {
    expect(builtServerOptions(['--built', '--host', '--port', '5190'])).toEqual({
      host: true,
      port: 5190,
    })
  })

  it('refuses a port that is no port', () => {
    expect(() => builtServerOptions(['--port', 'abc'])).toThrow('port')
    expect(() => builtServerOptions(['--port', '70000'])).toThrow('port')
  })
})

// On 22.11.2026 a phone's file picker greyed out the Gen 3 dump because the input said
// accept=".gba" (src/web/pages.test.ts holds that rule for the Gen 3 pages). The spike page checks
// the header itself (src/gen5/nds-header.ts), so its input takes any file.
describe('the spike page', () => {
  const html = readFileSync(`${GEN5_PATHS.page}/index.html`, 'utf8')

  it('lets the picker offer any file', () => {
    const input = /<input id="dump"[^>]*>/.exec(html)?.[0]
    expect(input).toBeDefined()
    expect(input).not.toMatch(/accept/i)
  })

  // Scene: the notice stands before the file input (#79, GPL-3.0 section 5(d)).
  it('shows the GPL notice before the file input and links the licences page', () => {
    const notice = /<section id="licence-notice">(.*?)<\/section>/s.exec(html)
    expect(notice).not.toBeNull()
    expect(notice?.index).toBeLessThan(html.indexOf('<input id="dump"'))
    const text = (notice?.[1] ?? '').replace(/\s+/g, ' ')
    for (const words of [
      'GNU General Public License, version 3',
      `EmulatorJS ${COMPONENTS.emulatorjs.version}`,
      'melonDS',
      'RetroArch',
      'no warranty',
      '<a href="licences.html">',
    ]) {
      expect(text).toContain(words)
    }
  })

  it('shows the speed cap, the core switch, the copy button and the phone note', () => {
    for (const id of ['uncapped', 'core-switch', 'vsync-switch', 'copy', 'figures', 'phone-note']) {
      expect(html).toContain(`id="${id}"`)
    }
  })
})

// Scene: the server answers 404 outside the manifest (scripts/gen5-manifest.ts).
describe('startBuiltServer', () => {
  const root = mkdtempSync(join(tmpdir(), 'gen5-built-'))
  const folders = {
    built: join(root, 'page'),
    site: join(root, 'site'),
    saves: join(root, 'saves'),
    sources: join(root, 'sources'),
  }
  const archive = archiveName(COMPONENTS.melonds.source)
  let server: Server | undefined

  beforeAll(async () => {
    for (const file of [
      'page/index.html',
      'site/data/loader.js',
      'site/data/version.json',
      `sources/${archive}`,
      'sources/other.tar.gz',
    ]) {
      mkdirSync(join(root, file, '..'), { recursive: true })
      writeFileSync(join(root, file), 'x')
    }
    writeLicencesPage(folders.built, {
      build: { commit: '1'.repeat(40), date: '2026-11-25', dirty: false },
      components: COMPONENTS,
      files: SITE_FILES,
      archives: [],
      notices: [],
      trees: [],
      unfound: [],
      gpl: 'invented',
      viewerLicence: 'invented',
    })
    server = await startBuiltServer({ host: false, port: 0 }, folders)
  })

  afterAll(() => {
    server?.close()
    rmSync(root, { recursive: true, force: true })
  })

  const answer = async (path: string): Promise<Response> => {
    const address = server?.address() as AddressInfo
    const response = await fetch(`http://127.0.0.1:${String(address.port)}${path}`)
    await response.arrayBuffer()
    return response
  }
  const status = async (path: string): Promise<number> => (await answer(path)).status

  it('answers a file the manifest serves and the page itself', async () => {
    expect(await status('/emulatorjs/data/loader.js')).toBe(200)
    expect(await status('/')).toBe(200)
  })

  it('answers the licences page the build writes as HTML', async () => {
    const response = await answer('/licences.html')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html')
  })

  it('names the size of an archive, so a HEAD answers it', async () => {
    const address = server?.address() as AddressInfo
    const url = `http://127.0.0.1:${String(address.port)}/source/${archive}`
    const response = await fetch(url, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('1')
  })

  it('answers 404 for a file of the site the manifest does not list', async () => {
    expect(await status('/emulatorjs/data/version.json')).toBe(404)
  })

  it('answers an archive the manifest names as gzip, and 404 for another name', async () => {
    const response = await answer(`/source/${archive}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/gzip')
    expect(await status('/source/other.tar.gz')).toBe(404)
  })
})
