// The words a visitor reads about what the licences page holds (#79): the notice before the file
// input says no more than the page covers and names its gaps, and the components that closed the
// last gaps (79-5) carry the versions their pins state (review W2, U-a, U-b).
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { COMPONENTS } from './gen5-manifest'
import { UNFOUND } from './gen5-notices'
import { GEN5_PATHS } from './gen5-paths'

const html = readFileSync(`${GEN5_PATHS.page}/index.html`, 'utf8')
const notice = (/<section id="licence-notice">(.*?)<\/section>/s.exec(html)?.[1] ?? '')
  .replace(/\s+/g, ' ')
  .trim()

// Scene: while the licences page lists parts it cannot cover, the notice claims no "every".
describe('the notice before the file input', () => {
  const open = UNFOUND.length > 0

  it('says neither "every" nor "each" while a notice is unfound', () => {
    expect({ open, claims: /\b(every|each)\b/i.test(notice) }).not.toEqual({
      open: true,
      claims: true,
    })
  })

  it('names the licences page for the licence text, the notices and the archives, and its gaps', () => {
    for (const words of [
      '<a href="licences.html">Licences and source code</a>',
      'the licence text, the copyright notices and the source archives',
      'lists what it cannot cover yet',
    ]) {
      expect(notice).toContain(words)
    }
    expect(notice).not.toMatch(/[\u2013\u2014]/)
  })
})

// Scene: Emscripten and zlib have their notices from their own pinned sources (79-5).
describe('the parts of the core', () => {
  it('lists no part without a notice', () => {
    expect(UNFOUND).toEqual([])
  })

  it("names Emscripten's release and zlib's version as the pins state them", () => {
    expect(COMPONENTS.emscripten.version.startsWith('4.0.8')).toBe(true)
    expect(COMPONENTS.emscripten.source.basis).toContain('inferred')
    expect(COMPONENTS.zlib.version).toBe('1.3.1')
  })
})
