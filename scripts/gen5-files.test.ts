import { describe, expect, it } from 'vitest'

import { fileFor, savesFileFor } from './gen5-files'

describe('fileFor', () => {
  const page = '/repo/build/gen5/page'
  const site = '/repo/.cache/gen5/emulatorjs/site'
  const saves = '/repo/src/web/gen5/saves'

  it('serves the page folder, with index.html at /', () => {
    expect(fileFor('/', page, site, saves)).toBe(`${page}/index.html`)
    expect(fileFor('/?threads=1', page, site, saves)).toBe(`${page}/index.html`)
    expect(fileFor('/assets/index-abc.js', page, site, saves)).toBe(`${page}/assets/index-abc.js`)
  })

  it('serves /emulatorjs/ from the fetched site', () => {
    expect(fileFor('/emulatorjs/data/loader.js', page, site, saves)).toBe(`${site}/data/loader.js`)
    expect(fileFor('/emulatorjs/data/cores/melonds-wasm.data?v=1', page, site, saves)).toBe(
      `${site}/data/cores/melonds-wasm.data`,
    )
  })

  it('refuses a path that climbs out of its folder, plain or encoded', () => {
    expect(fileFor('/emulatorjs/../../build/x.nds', page, site, saves)).toBeUndefined()
    expect(fileFor('/../.cache/x', page, site, saves)).toBeUndefined()
    expect(fileFor('/%2e%2e/%2e%2e/secret', page, site, saves)).toBeUndefined()
    expect(fileFor('/emulatorjs/%2e%2e/%2e%2e/page/index.html', page, site, saves)).toBeUndefined()
  })

  it('serves /saves/ from the saves folder alone', () => {
    expect(fileFor('/saves/route-20.sav', page, site, saves)).toBe(`${saves}/route-20.sav`)
    expect(fileFor('/saves/../index.html', page, site, saves)).toBeUndefined()
    expect(fileFor('/saves/%2e%2e/index.html', page, site, saves)).toBeUndefined()
  })

  it('refuses a malformed escape and a NUL byte', () => {
    expect(fileFor('/%E0%A4%A', page, site, saves)).toBeUndefined()
    expect(fileFor('/index.html%00.js', page, site, saves)).toBeUndefined()
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
