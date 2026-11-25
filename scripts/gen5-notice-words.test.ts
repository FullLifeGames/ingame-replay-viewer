// The words a visitor reads about what the licences page holds (#79): the notice before the file
// input says no more than the page covers, and the parts without a notice say only what the
// files show (review W2, U-a, U-b).
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { COMPONENTS, SITE_FILES } from './gen5-manifest'
import { unnamedLicenceFiles } from './gen5-manifest-check'
import { UNFOUND } from './gen5-notices'
import { GEN5_PATHS } from './gen5-paths'

const html = readFileSync(`${GEN5_PATHS.page}/index.html`, 'utf8')
const notice = (/<section id="licence-notice">(.*?)<\/section>/s.exec(html)?.[1] ?? '')
  .replace(/\s+/g, ' ')
  .trim()

// Scene: the licences page lists parts it cannot cover yet, so the notice claims no "every".
describe('the notice before the file input', () => {
  const gaps = unnamedLicenceFiles({ components: COMPONENTS, files: SITE_FILES }).length
  const open = gaps + UNFOUND.length > 0

  it('says neither "every" nor "each" while a licence is unnamed or a notice unfound', () => {
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

describe('the parts without a notice in the pinned sources', () => {
  const says = Object.fromEntries(UNFOUND.map((part) => [part.part, part.says]))

  it("says of Emscripten what the build scripts and the core's bytes name, and what is open", () => {
    const emscripten = says["Emscripten's runtime"] ?? ''
    expect(emscripten).toContain('build_env.sh names emsdk 3.1.74 for a local build')
    expect(emscripten).toContain(
      '21.0.0git (https:/github.com/llvm/llvm-project 23e3cbb2e82b62586266116c8ab77ce68e412cf8)',
    )
    expect(emscripten).toContain('Which Emscripten release that was is not established.')
  })

  it("says of zlib what the core's bytes hold, and that no notice survives in them", () => {
    const zlib = says.zlib ?? ''
    expect(zlib).toContain('-s USE_ZLIB=1')
    expect(zlib).toContain('the string 1.3.1')
    expect(zlib).toContain('no copyright line')
  })
})
