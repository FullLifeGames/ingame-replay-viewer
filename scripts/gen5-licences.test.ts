import { describe, expect, it } from 'vitest'

import { type LicencesInput, licencesHtml, type ReadNotice } from './gen5-licences'
import {
  archiveName,
  type Component,
  COMPONENTS,
  type SiteFile,
  type Source,
  VIEWER_REPOSITORY,
} from './gen5-manifest'

// Invented inputs: two sources, three components (one with an unnamed licence), invented texts.
const CORE: Source = {
  name: 'core',
  repository: 'https://github.com/example/core',
  commit: 'c'.repeat(40),
  tar: 'd'.repeat(64),
}
const PAD: Source = {
  name: 'pad',
  repository: 'https://github.com/example/pad',
  commit: 'e'.repeat(40),
  tar: 'f'.repeat(64),
}
const part = (name: string, source: Source, licence: Component['licence']): Component => ({
  name,
  version: '1.2.3',
  licence,
  from: '@example/site@1.2.3',
  source,
  notices: [],
})
const COMPONENTS_INVENTED = {
  ...COMPONENTS,
  emulatorjs: part('Shell', CORE, 'GPL-3.0'),
  melonds: part('Core', CORE, 'GPL-3.0'),
  nipplejs: part('Pad', PAD, 'MIT'),
  extract7z: part('Unpacker', CORE, { unnamed: 'nobody names it' }),
}
const FILES: readonly SiteFile[] = [
  { path: 'data/shell.js', components: ['emulatorjs'], presence: 'served', why: 'logged' },
  { path: 'data/core.data', components: ['melonds'], presence: 'served', why: 'logged' },
  { path: 'data/pad.js', components: ['nipplejs'], presence: 'served', why: 'logged' },
  { path: 'data/unpack.js', components: ['extract7z'], presence: 'served', why: 'logged' },
  { path: 'data/shell.min.js', components: ['emulatorjs'], presence: 'absent', why: 'logged' },
]
const NOTICES: readonly ReadNotice[] = [
  {
    component: 'melonds',
    part: 'Core',
    path: 'src/core.c',
    lines: [1, 2],
    kind: 'notice',
    text: 'Copyright 2020 Core <core@example.invalid> & friends',
  },
  { component: 'nipplejs', part: 'Pad', path: 'LICENSE', kind: 'licence', text: 'MIT pad text' },
]
const COMMIT = '1'.repeat(40)
const INPUT: LicencesInput = {
  build: { commit: COMMIT, date: '2026-11-25', dirty: false },
  components: COMPONENTS_INVENTED,
  files: FILES,
  archives: [
    { source: CORE, bytes: 1_234_567 },
    { source: PAD, bytes: 89 },
  ],
  notices: NOTICES,
  trees: [
    {
      component: 'melonds',
      part: 'Core library',
      folder: 'lib/',
      extensions: ['.c'],
      commit: CORE.commit,
      groups: [{ text: '/* Copyright 2021 Lib */', paths: ['lib/a.c', 'lib/b.c'] }],
      bare: ['lib/c.c'],
    },
  ],
  unfound: [{ component: 'melonds', part: 'Runtime', says: 'No pinned source holds it.' }],
  gpl: 'GNU GENERAL PUBLIC LICENSE\nVersion 3 <invented>',
  viewerLicence: 'MIT License\n\nCopyright (c) invented',
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

// Scene: the licences page carries everything.
describe('licencesHtml', () => {
  const html = licencesHtml(INPUT)

  it('heads the page and names the build by date and commit, linking the repository there', () => {
    expect(html).toContain('<h1>Licences and source code</h1>')
    expect(textOf(html)).toContain(`Built on 2026-11-25 from commit ${COMMIT}`)
    expect(html).toContain(`href="${VIEWER_REPOSITORY}/tree/${COMMIT}"`)
    expect(html).not.toContain('The build machine had changes')
  })

  it('says so when the build machine had changes the commit lacks', () => {
    const dirty = licencesHtml({ ...INPUT, build: { ...INPUT.build, dirty: true } })
    expect(dirty).toContain('The build machine had changes that are not in that commit.')
  })

  it('holds one row per file the page sends, and none for an absent one', () => {
    const rows = html.match(/<tr data-path="[^"]*">/g) ?? []
    expect(rows).toEqual([
      '<tr data-path="/emulatorjs/data/shell.js">',
      '<tr data-path="/emulatorjs/data/core.data">',
      '<tr data-path="/emulatorjs/data/pad.js">',
      '<tr data-path="/emulatorjs/data/unpack.js">',
    ])
  })

  it('reads the row of a file with an unnamed licence as the plan writes it', () => {
    const row = /<tr data-path="\/emulatorjs\/data\/unpack.js">.*?<\/tr>/s.exec(html)?.[0] ?? ''
    expect(textOf(row)).toContain('Licence not named. EmulatorJS ships this file without one.')
  })

  it('links each archive once with its commit, size and tar hash, and its repository there', () => {
    const section = html.slice(html.indexOf('<h2 id="sources">'), html.indexOf('<h2 id="notices">'))
    for (const source of [CORE, PAD]) {
      const link = `href="/source/${archiveName(source)}"`
      expect(section.split('<li>').filter((line) => line.includes(link))).toHaveLength(1)
      expect(html).toContain(source.tar)
      expect(html).toContain(`href="${source.repository}/tree/${source.commit}"`)
    }
    expect(textOf(html)).toContain('(1,234,567 bytes). SHA-256 of the unpacked tar:')
  })

  it("carries the GPL's full text, the notices, the MIT texts and the parts without notice", () => {
    const text = textOf(html)
    expect(text).toContain('GNU GENERAL PUBLIC LICENSE\nVersion 3 &lt;invented&gt;')
    expect(text).toContain('MIT pad text')
    expect(text).toContain('MIT License\n\nCopyright (c) invented')
    expect(text).toContain('Runtime')
    expect(text).toContain('No pinned source holds it.')
    expect(text).toContain(`src/core.c, lines 1 to 2, at commit ${CORE.commit.slice(0, 7)}`)
  })

  it("shows a notice tree's groups under its component, after the component's own notices", () => {
    const section = textOf(html.slice(html.indexOf('<h2 id="notices">')))
    expect(section).toContain('Core library')
    expect(section).toContain('2 files carry this text: lib/a.c, lib/b.c')
    expect(section).toContain('No notice in the file: lib/c.c')
    expect(section.indexOf('Copyright 2020 Core')).toBeLessThan(section.indexOf('Core library'))
  })

  it('escapes < and & from a fetched notice', () => {
    expect(html).toContain('Copyright 2020 Core &lt;core@example.invalid&gt; &amp; friends')
    expect(html).not.toContain('<core@example.invalid>')
  })

  it('orders the sections as plan section 6 does', () => {
    const order = ['files', 'sources', 'notices', 'licence-texts'].map((id) =>
      html.indexOf(`<h2 id="${id}">`),
    )
    expect(order.every((at) => at > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
