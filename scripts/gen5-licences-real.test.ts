// The licences page from the pinned sources on the build machine (#79): every notice the manifest
// names reads from its file at the pin, and the page links every archive and names no path of the
// machine. CI fetches no sources (D3), so there the spec skips, as on any machine where
// scripts/gen5-sources.ts has not placed every archive and bare repository.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { licencesHtml } from './gen5-licences.ts'
import { readLicencesInput } from './gen5-licences-read.ts'
import { archiveName, SOURCES } from './gen5-manifest.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const placed =
  SOURCES.length > 0 &&
  SOURCES.every(
    (source) =>
      existsSync(join(GEN5_PATHS.sources, archiveName(source))) &&
      existsSync(join(GEN5_PATHS.sources, 'git', `${source.name}.git`, 'HEAD')),
  )

describe.skipIf(!placed)(
  'the licences page from the pins (skips unless scripts/gen5-sources.ts placed every source)',
  () => {
    const input = placed ? readLicencesInput(GEN5_PATHS.sources) : undefined

    it('reads each notice as a copyright, licence or public domain text', () => {
      expect(input?.notices.length ?? 0).toBeGreaterThan(20)
      for (const notice of input?.notices ?? []) {
        expect({
          path: notice.path,
          notice: /copyright|licen[cs]e|public domain/i.test(notice.text),
        }).toEqual({ path: notice.path, notice: true })
      }
    })

    it("takes the GPL's full text from melonDS's LICENSE", () => {
      expect(input?.gpl.trimStart().startsWith('GNU GENERAL PUBLIC LICENSE')).toBe(true)
      expect(input?.gpl).toContain('END OF TERMS AND CONDITIONS')
    })

    it('links every archive and names no path of the build machine', () => {
      const html = input === undefined ? '' : licencesHtml(input)
      for (const source of SOURCES) expect(html).toContain(`href="/source/${archiveName(source)}"`)
      expect(html).not.toContain(GEN5_PATHS.repo)
    })
  },
)
