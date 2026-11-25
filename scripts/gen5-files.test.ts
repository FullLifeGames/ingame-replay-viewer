import { describe, expect, it } from 'vitest'

import { fileFor, savesFileFor, siteFileFor, sitePathOf, sourceFileFor } from './gen5-files'
import { archiveName, COMPONENTS, sourceOf } from './gen5-manifest'

const ARCHIVE = archiveName(sourceOf(COMPONENTS.melonds))

describe('fileFor', () => {
  const page = '/repo/build/gen5/page'
  const site = '/repo/.cache/gen5/emulatorjs/site'
  const saves = '/repo/src/web/gen5/saves'
  const sources = '/repo/.cache/gen5/sources'
  const folders = { built: page, site, saves, sources }

  it('serves the page folder, with index.html at /', () => {
    expect(fileFor('/', folders)).toBe(`${page}/index.html`)
    expect(fileFor('/?threads=1', folders)).toBe(`${page}/index.html`)
    expect(fileFor('/assets/index-abc.js', folders)).toBe(`${page}/assets/index-abc.js`)
  })

  it('serves /emulatorjs/ from the fetched site', () => {
    expect(fileFor('/emulatorjs/data/loader.js', folders)).toBe(`${site}/data/loader.js`)
    expect(fileFor('/emulatorjs/data/cores/melonds-wasm.data?v=1', folders)).toBe(
      `${site}/data/cores/melonds-wasm.data`,
    )
  })

  it('refuses a path that climbs out of its folder, plain or encoded', () => {
    expect(fileFor('/emulatorjs/../../build/x.nds', folders)).toBeUndefined()
    expect(fileFor('/../.cache/x', folders)).toBeUndefined()
    expect(fileFor('/%2e%2e/%2e%2e/secret', folders)).toBeUndefined()
    expect(fileFor('/emulatorjs/%2e%2e/%2e%2e/page/index.html', folders)).toBeUndefined()
  })

  it('serves /saves/ from the saves folder alone', () => {
    expect(fileFor('/saves/route-20.sav', folders)).toBe(`${saves}/route-20.sav`)
    expect(fileFor('/saves/../index.html', folders)).toBeUndefined()
    expect(fileFor('/saves/%2e%2e/index.html', folders)).toBeUndefined()
  })

  it('serves /source/ from the source archives alone', () => {
    expect(fileFor(`/source/${ARCHIVE}`, folders)).toBe(`${sources}/${ARCHIVE}`)
    expect(fileFor('/source/index.html', folders)).toBeUndefined()
  })

  // Scene: the review's probe saw both refused; the spec holds it (review, missing tests).
  it('refuses an upper-case variant of a served path and a double slash after the prefix', () => {
    for (const url of [
      '/EMULATORJS/data/loader.js',
      '/emulatorjs/DATA/loader.js',
      '/emulatorjs/data/LOADER.JS',
      '/emulatorjs//data/loader.js',
      '/emulatorjs//data/version.json',
    ]) {
      expect(siteFileFor(url, site), url).toBeUndefined()
      expect(fileFor(url, folders)?.startsWith(site) ?? false, url).toBe(false)
    }
  })

  it('refuses a malformed escape and a NUL byte', () => {
    expect(fileFor('/%E0%A4%A', folders)).toBeUndefined()
    expect(fileFor('/index.html%00.js', folders)).toBeUndefined()
  })
})

// Scene: a path the manifest does not list (scripts/gen5-manifest.ts).
describe('siteFileFor', () => {
  const site = '/repo/.cache/gen5/emulatorjs/site'

  it('maps a path the manifest serves, with or without a query', () => {
    expect(siteFileFor('/emulatorjs/data/loader.js', site)).toBe(`${site}/data/loader.js`)
    expect(siteFileFor('/emulatorjs/data/cores/melonds-wasm.data?v=1', site)).toBe(
      `${site}/data/cores/melonds-wasm.data`,
    )
  })

  it('refuses a file of the site that the manifest does not list, and one it lists as absent', () => {
    for (const inside of [
      'data/version.json',
      'index.html',
      'package.json',
      'data/compression/extractzip.js',
      'data/emulator.min.js',
      '',
    ])
      expect(siteFileFor(`/emulatorjs/${inside}`, site), inside).toBeUndefined()
  })
})

describe('sitePathOf', () => {
  it('gives the normalized path inside the site', () => {
    expect(sitePathOf('/emulatorjs/data//src/./emulator.js?x')).toBe('data/src/emulator.js')
    expect(sitePathOf('/emulatorjs/')).toBe('')
  })

  it('gives nothing for a path outside the site or one that climbs out', () => {
    expect(sitePathOf('/saves/route-20.sav')).toBeUndefined()
    expect(sitePathOf('/emulatorjs/../index.html')).toBeUndefined()
    expect(sitePathOf('/emulatorjs/%E0%A4%A')).toBeUndefined()
  })
})

describe('savesFileFor', () => {
  const saves = '/repo/src/web/gen5/saves'

  it('answers a save by its name, with or without a query', () => {
    expect(savesFileFor('/saves/route-20.sav', saves)).toBe(`${saves}/route-20.sav`)
    expect(savesFileFor('/saves/town.sav?v=1', saves)).toBe(`${saves}/town.sav`)
  })

  it('answers no other path', () => {
    expect(savesFileFor('/emulatorjs/data/loader.js', saves)).toBeUndefined()
    expect(savesFileFor('/savesx/route-20.sav', saves)).toBeUndefined()
    expect(savesFileFor('/saves/route-20.nds', saves)).toBeUndefined()
    expect(savesFileFor('/saves/route-20', saves)).toBeUndefined()
  })

  it('refuses a path that climbs out or enters a folder, plain or encoded', () => {
    expect(savesFileFor('/saves/../../build/gen5/saves/town.sav', saves)).toBeUndefined()
    expect(savesFileFor('/saves/%2e%2e/%2e%2e/build/gen5/saves/town.sav', saves)).toBeUndefined()
    expect(savesFileFor('/saves/..%2fx.sav', saves)).toBeUndefined()
    expect(savesFileFor('/saves/a/b.sav', saves)).toBeUndefined()
    expect(savesFileFor('/saves/%E0%A4%A.sav', saves)).toBeUndefined()
  })
})

// Scene: /source/ answers the manifest's archive names alone (scripts/gen5-manifest.ts).
describe('sourceFileFor', () => {
  const sources = '/repo/.cache/gen5/sources'

  it('maps an archive the manifest names into the sources folder, with or without a query', () => {
    expect(sourceFileFor(`/source/${ARCHIVE}`, sources)).toBe(`${sources}/${ARCHIVE}`)
    expect(sourceFileFor(`/source/${ARCHIVE}?x=1`, sources)).toBe(`${sources}/${ARCHIVE}`)
  })

  it('refuses another name, a part file, a climb, a sub-folder and the bare repositories', () => {
    for (const url of [
      '/source/other.tar.gz',
      `/source/${ARCHIVE}.part`,
      `/source/../${ARCHIVE}`,
      `/source/%2e%2e/emulatorjs/site/data/loader.js`,
      `/source/sub/${ARCHIVE}`,
      '/source/git/melonds.git/HEAD',
      '/source/',
      `/sources/${ARCHIVE}`,
      `/emulatorjs/${ARCHIVE}`,
    ])
      expect(sourceFileFor(url, sources), url).toBeUndefined()
  })
})
