import { describe, expect, it } from 'vitest'

import { fileFor } from './gen5-files'

describe('fileFor', () => {
  const page = '/repo/build/gen5/page'
  const site = '/repo/.cache/gen5/emulatorjs/site'

  it('serves the page folder, with index.html at /', () => {
    expect(fileFor('/', page, site)).toBe(`${page}/index.html`)
    expect(fileFor('/?threads=1', page, site)).toBe(`${page}/index.html`)
    expect(fileFor('/assets/index-abc.js', page, site)).toBe(`${page}/assets/index-abc.js`)
  })

  it('serves /emulatorjs/ from the fetched site', () => {
    expect(fileFor('/emulatorjs/data/loader.js', page, site)).toBe(`${site}/data/loader.js`)
    expect(fileFor('/emulatorjs/data/cores/melonds-wasm.data?v=1', page, site)).toBe(
      `${site}/data/cores/melonds-wasm.data`,
    )
  })

  it('refuses a path that climbs out of its folder, plain or encoded', () => {
    expect(fileFor('/emulatorjs/../../build/x.nds', page, site)).toBeUndefined()
    expect(fileFor('/../.cache/x', page, site)).toBeUndefined()
    expect(fileFor('/%2e%2e/%2e%2e/secret', page, site)).toBeUndefined()
    expect(fileFor('/emulatorjs/%2e%2e/%2e%2e/page/index.html', page, site)).toBeUndefined()
  })

  it('refuses a malformed escape and a NUL byte', () => {
    expect(fileFor('/%E0%A4%A', page, site)).toBeUndefined()
    expect(fileFor('/index.html%00.js', page, site)).toBeUndefined()
  })
})
