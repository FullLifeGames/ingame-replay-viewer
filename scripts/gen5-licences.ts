// The Gen 5 page's licences page (#79, plan section 6): its HTML from the manifest
// (scripts/gen5-manifest.ts), the notices and licence texts read at the pins
// (scripts/gen5-licences-read.ts), the archives' sizes and the build's commit and date. Pure: it
// reads nothing, and every string from a fetched file goes in escaped.
import {
  archiveName,
  type Component,
  type ComponentId,
  type Licence,
  OWN_FILES,
  type SiteFile,
  type Source,
  VIEWER_REPOSITORY,
} from './gen5-manifest.ts'
import { escapeHtml, link, pre, short } from './gen5-html.ts'
import { type ReadTree, treeHtml } from './gen5-notice-groups.ts'
import type { Notice, Unfound } from './gen5-notices.ts'

/** The build's commit and date, and whether the tree had changes the commit lacks (D9). */
export interface BuildStamp {
  commit: string
  date: string
  dirty: boolean
}

/** A notice with the text read from its file at the component's pin. */
export interface ReadNotice extends Notice {
  component: ComponentId
  text: string
}

/** A source archive and its size in bytes. */
export interface Archive {
  source: Source
  bytes: number
}

export interface LicencesInput {
  build: BuildStamp
  components: Readonly<Record<ComponentId, Component>>
  files: readonly SiteFile[]
  archives: readonly Archive[]
  notices: readonly ReadNotice[]
  /** The folders whose files each carry their own notice, grouped by its text. */
  trees: readonly ReadTree[]
  unfound: readonly Unfound[]
  /** The GPL's full text, from melonDS's LICENSE at its pin (D6). */
  gpl: string
  /** The viewer repository's LICENSE. */
  viewerLicence: string
}

const treeOf = (repository: string, commit: string) => `${repository}/tree/${commit}`

/** Until U1 is ruled, the words of plan section 6, point 7, for a licence nobody names. */
function licenceWords(licence: Licence): string {
  return typeof licence === 'string'
    ? licence
    : 'Licence not named. EmulatorJS ships this file without one.'
}

/** The name the page gives `source`: that of the first component it is the source of. */
function sourceName(input: LicencesInput, source: Source): string {
  const owner = Object.values(input.components).find((part) => part.source.name === source.name)
  return owner?.name ?? source.name
}

function intro(input: LicencesInput): string {
  const version = escapeHtml(input.components.emulatorjs.version)
  const { commit, date, dirty } = input.build
  const changes = dirty ? ' The build machine had changes that are not in that commit.' : ''
  return `<h1>Licences and source code</h1>
<p>This page runs EmulatorJS ${version}, its melonDS core and RetroArch. All three are under the GNU General Public License, version 3 (GPL-3.0). The viewer's own code drives the emulator in the same tab, so we treat the page and the emulator as one program and license the page as a whole to you under GPL-3.0. The viewer's repository stays under the MIT licence, which GPL-3.0 allows.</p>
<p>Built on ${escapeHtml(date)} from commit ${escapeHtml(commit)} of the viewer's repository. The build adds the viewer's code to EmulatorJS ${version} and changes none of EmulatorJS's files.${changes} ${link(treeOf(VIEWER_REPOSITORY, commit), "The viewer's repository at that commit")}.</p>
<p>${link('./', 'Back to the page')}</p>`
}

const COLUMNS = ['Path', 'Component', 'Version', 'Licence', 'Source']

/** The cells of one row, each labelled with its column for the narrow layout. */
const cellsOf = (cells: readonly string[]) =>
  cells.map((cell, at) => `<td data-label="${COLUMNS[at] ?? ''}">${cell}</td>`).join('')

function fileRow(input: LicencesInput, file: SiteFile): string {
  const parts = file.components.map((id) => input.components[id])
  const sources = [...new Map(parts.map((part) => [part.source.name, part.source])).values()]
  const cells = [
    `<code>${escapeHtml(`/emulatorjs/${file.path}`)}</code>`,
    parts.map((part) => escapeHtml(part.name)).join('<br>'),
    parts.map((part) => escapeHtml(part.version)).join('<br>'),
    parts.map((part) => escapeHtml(licenceWords(part.licence))).join('<br>'),
    sources
      .map((source) =>
        link(
          `/source/${archiveName(source)}`,
          `${sourceName(input, source)} ${short(source.commit)}`,
        ),
      )
      .join('<br>'),
  ]
  const path = escapeHtml(`/emulatorjs/${file.path}`)
  return `<tr data-path="${path}">${cellsOf(cells)}</tr>`
}

function filesTable(input: LicencesInput): string {
  const sent = input.files.filter((file) => file.presence === 'served')
  const tree = treeOf(VIEWER_REPOSITORY, input.build.commit)
  const own = OWN_FILES.map(
    (rule) =>
      `<tr>${cellsOf([
        escapeHtml(rule.files),
        'the viewer',
        `commit ${short(input.build.commit)}`,
        escapeHtml(licenceWords(rule.licence)),
        link(tree, rule.source),
      ])}</tr>`,
  )
  return `<h2 id="files">Files this page sends</h2>
<table>
<thead><tr>${COLUMNS.map((column) => `<th>${column}</th>`).join('')}</tr></thead>
<tbody>
${[...sent.map((file) => fileRow(input, file)), ...own].join('\n')}
</tbody>
</table>`
}

function sourcesList(input: LicencesInput): string {
  const lines = input.archives.map(({ source, bytes }) => {
    const archive = archiveName(source)
    const size = bytes.toLocaleString('en-US')
    return `<li>${escapeHtml(sourceName(input, source))} at commit ${escapeHtml(source.commit)}: ${link(`/source/${archive}`, archive)} (${size} bytes). SHA-256 of the unpacked tar: <code>${escapeHtml(source.tar)}</code>. ${link(treeOf(source.repository, source.commit), 'The repository at that commit')}.</li>`
  })
  const { commit } = input.build
  lines.push(
    `<li>The viewer at commit ${escapeHtml(commit)}: ${link(treeOf(VIEWER_REPOSITORY, commit), 'its repository at that commit')}.</li>`,
  )
  return `<h2 id="sources">Source code</h2>
<ul>
${lines.join('\n')}
</ul>`
}

/** Where a notice stands: its file, its lines, the commit. */
function whereFrom(input: LicencesInput, notice: ReadNotice): string {
  const lines =
    notice.lines === undefined
      ? ''
      : `, lines ${String(notice.lines[0])} to ${String(notice.lines[1])}`
  const commit = short(input.components[notice.component].source.commit)
  return `<p class="from">${escapeHtml(notice.path)}${lines}, at commit ${commit}</p>`
}

/** Each notice of `kind` under its part, grouped under its component's name. */
function noticesOf(
  input: LicencesInput,
  ids: readonly ComponentId[],
  kind: Notice['kind'],
): string {
  return ids
    .map((id) => {
      const own = input.notices.filter((notice) => notice.component === id && notice.kind === kind)
      const trees = kind === 'notice' ? input.trees.filter((tree) => tree.component === id) : []
      if (own.length + trees.length === 0) return ''
      const items = own.map(
        (notice) =>
          `<h4>${escapeHtml(notice.part)}</h4>\n${whereFrom(input, notice)}\n${pre(notice.text)}`,
      )
      items.push(...trees.map(treeHtml))
      return `<h3>${escapeHtml(input.components[id].name)}</h3>\n${items.join('\n')}`
    })
    .filter((block) => block !== '')
    .join('\n')
}

function noticesSection(input: LicencesInput): string {
  const ids = Object.keys(input.components) as ComponentId[]
  const unfound = input.unfound.map(
    (part) =>
      `<li>${escapeHtml(part.part)}, in ${escapeHtml(input.components[part.component].name)}: ${escapeHtml(part.says)}</li>`,
  )
  return `<h2 id="notices">Copyright notices</h2>
${noticesOf(input, ids, 'notice')}
<h3>Parts without a notice in the pinned sources</h3>
<ul>
${unfound.join('\n')}
</ul>`
}

/** The GPL, then the MIT texts and the viewer's LICENSE, then the core's third-party licences. */
function licenceTexts(input: LicencesInput): string {
  const ids = Object.keys(input.components) as ComponentId[]
  const mit = ids.filter((id) => input.components[id].licence === 'MIT')
  const rest = ids.filter((id) => !mit.includes(id))
  const gplFrom = short(input.components.melonds.source.commit)
  return `<h2 id="licence-texts">Licence texts</h2>
<h3>GNU General Public License, version 3</h3>
<p class="from">LICENSE of melonDS, at commit ${gplFrom}</p>
${pre(input.gpl)}
${noticesOf(input, mit, 'licence')}
<h3>The viewer</h3>
<p class="from">LICENSE of the viewer's repository, at commit ${short(input.build.commit)}</p>
${pre(input.viewerLicence)}
${noticesOf(input, rest, 'licence')}`
}

/** On a phone each row of the table stands as a block of labelled lines. */
const STYLE = `body { font-family: system-ui, sans-serif; margin: 1rem; max-width: 60rem; }
body { overflow-wrap: anywhere; }
table { border-collapse: collapse; font-size: 0.85rem; }
th, td { border: 1px solid #999; padding: 0.25rem; text-align: left; vertical-align: top; }
pre { white-space: pre-wrap; font-size: 0.8rem; }
.from { font-size: 0.85rem; color: #555; }
@media (max-width: 40rem) {
  thead { display: none; }
  table, tbody, tr, td { display: block; }
  tr { border: 1px solid #999; margin-bottom: 0.5rem; }
  td { border: none; }
  td::before { content: attr(data-label) ": "; font-weight: bold; }
}`

/** The licences page for `input`. */
export function licencesHtml(input: LicencesInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Gen 5 spike: licences and source code</title>
<style>
${STYLE}
</style>
</head>
<body>
${[intro(input), filesTable(input), sourcesList(input), noticesSection(input), licenceTexts(input)].join('\n')}
</body>
</html>
`
}
