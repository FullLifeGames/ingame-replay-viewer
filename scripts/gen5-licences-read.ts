// What the Gen 5 licences page (#79) reads: each notice and the GPL's text from the bare
// repositories at the pins (`git show <commit>:<path>`; scripts/gen5-sources.ts keeps a ref on
// each pin), the archives' sizes, the viewer's LICENSE and the build's commit and date. Without
// the archives it stops with the sentence that names the fetch script; a notice it cannot read
// stops it with the component's and the file's name.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Archive, type LicencesInput, licencesHtml, type ReadNotice } from './gen5-licences.ts'
import {
  archiveName,
  type Component,
  type ComponentId,
  COMPONENTS,
  SITE_FILES,
  type Source,
  SOURCES,
} from './gen5-manifest.ts'
import { GPL_TEXT, type Notice, UNFOUND } from './gen5-notices.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** Reads the file `path` of `source` at its pinned commit; throws when it cannot. */
export type Reader = (source: Source, path: string) => string

const FETCH_FIRST = 'run node scripts/gen5-sources.ts first'

/** `bytes` as UTF-8, or as Latin-1 for a file that is no valid UTF-8, so no byte is lost. */
function decoded(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

/** A reader on the bare repositories under `sources`/git/ (scripts/gen5-sources.ts). */
function gitReader(sources: string): Reader {
  return (source, path) => {
    const dir = join(sources, 'git', `${source.name}.git`)
    if (!existsSync(join(dir, 'HEAD'))) {
      throw new Error(`gen5-licences: no repository of ${source.name}; ${FETCH_FIRST}`)
    }
    const show = ['-C', dir, 'show', `${source.commit}:${path}`]
    return decoded(execFileSync('git', show, { stdio: ['ignore', 'pipe', 'pipe'] }))
  }
}

/** The lines of `text` a notice names, or the whole text; throws when the file is too short. */
function noticeText(part: Component, notice: Notice, text: string): string {
  if (notice.lines === undefined) return text
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
  const [first, last] = notice.lines
  if (last > lines.length || first < 1 || first > last) {
    const range = `${String(first)} to ${String(last)}`
    throw new Error(`${part.name}: ${notice.path} has ${String(lines.length)} lines, not ${range}`)
  }
  return lines.slice(first - 1, last).join('\n')
}

/** Every notice of `components`, read through `read`; throws naming the component and the file
 * of a notice it cannot read. */
export function readNotices(
  components: Readonly<Record<ComponentId, Component>>,
  read: Reader,
): ReadNotice[] {
  return (Object.keys(components) as ComponentId[]).flatMap((id) => {
    const part = components[id]
    return part.notices.map((notice) => {
      let text: string
      try {
        text = read(part.source, notice.path)
      } catch (error) {
        const at = `${notice.path} at ${part.source.commit}`
        throw new Error(`${part.name}: cannot read ${at}`, { cause: error })
      }
      return { ...notice, component: id, text: noticeText(part, notice, text) }
    })
  })
}

/** Each source's archive in `sources` with its size; throws when one is missing. */
function archivesIn(sources: string): Archive[] {
  return SOURCES.map((source) => {
    const file = join(sources, archiveName(source))
    const stat = statSync(file, { throwIfNoEntry: false })
    if (stat?.isFile() !== true) {
      throw new Error(`gen5-licences: no ${archiveName(source)}; ${FETCH_FIRST}`)
    }
    return { source, bytes: stat.size }
  })
}

const repoGit = (...args: string[]) =>
  execFileSync('git', ['-C', GEN5_PATHS.repo, ...args], { encoding: 'utf8' })

/** The licences page's inputs from the archives and bare repositories in `sources`. */
export function readLicencesInput(sources: string): LicencesInput {
  const archives = archivesIn(sources)
  const read = gitReader(sources)
  return {
    build: {
      commit: repoGit('rev-parse', 'HEAD').trim(),
      date: new Date().toISOString().slice(0, 10),
      dirty: repoGit('status', '--porcelain').trim() !== '',
    },
    components: COMPONENTS,
    files: SITE_FILES,
    archives,
    notices: readNotices(COMPONENTS, read),
    unfound: UNFOUND,
    gpl: read(COMPONENTS[GPL_TEXT.component].source, GPL_TEXT.path),
    viewerLicence: readFileSync(join(GEN5_PATHS.repo, 'LICENSE'), 'utf8'),
  }
}

/** Writes the licences page for `input` into `folder` as licences.html. */
export function writeLicencesPage(folder: string, input: LicencesInput): void {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'licences.html'), licencesHtml(input))
}
