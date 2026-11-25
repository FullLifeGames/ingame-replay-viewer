// What the Gen 5 licences page (#79) reads: each notice and the GPL's text from the bare
// repositories at the pins (`git show <commit>:<path>`; scripts/gen5-sources.ts keeps a ref on
// each pin), the archives' sizes, the viewer's LICENSE and the build's commit and date. Without
// the archives it stops with the sentence that names the fetch script; a notice it cannot read
// stops it with the component's and the file's name.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type Archive,
  type BuildStamp,
  type LicencesInput,
  licencesHtml,
  type ReadNotice,
} from './gen5-licences.ts'
import {
  FETCH_FIRST,
  gitReader,
  gitTreeReader,
  type Reader,
  type TreeReader,
} from './gen5-licences-git.ts'
import {
  archiveName,
  type Component,
  type ComponentId,
  COMPONENTS,
  SITE_FILES,
  SOURCES,
} from './gen5-manifest.ts'
import { groupNotices, type ReadTree, type TreeFile } from './gen5-notice-groups.ts'
import { GPL_TEXT, type Notice, NOTICE_TREES, type NoticeTree, UNFOUND } from './gen5-notices.ts'
import { LICENCES_PAGE } from './gen5-files.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

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
      const { source } = part
      let text: string
      try {
        text = read(source, notice.path)
      } catch (error) {
        const at = `${notice.path} at ${source.commit}`
        throw new Error(`${part.name}: cannot read ${at}`, { cause: error })
      }
      return { ...notice, component: id, text: noticeText(part, notice, text) }
    })
  })
}

/** Each notice tree of `components`, its files read through `readTree` and grouped by their
 * opening comment; throws naming the component and the folder it cannot read. */
export function readNoticeTrees(
  components: Readonly<Record<ComponentId, Component>>,
  trees: readonly NoticeTree[],
  readTree: TreeReader,
): ReadTree[] {
  return trees.map((tree) => {
    const part = components[tree.component]
    const { source } = part
    let files: readonly TreeFile[]
    try {
      files = readTree(source, tree.folder)
    } catch (error) {
      const at = `${tree.folder} at ${source.commit}`
      throw new Error(`${part.name}: cannot read ${at}`, { cause: error })
    }
    const kept = files.filter(
      ({ path }) =>
        path.startsWith(tree.folder) && tree.extensions.some((ending) => path.endsWith(ending)),
    )
    return { ...tree, commit: source.commit, ...groupNotices(kept) }
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

/** Runs git in the viewer's repository with `args` and gives what it prints. */
export type RepoGit = (...args: string[]) => string

const repoGit: RepoGit = (...args) =>
  execFileSync('git', ['-C', GEN5_PATHS.repo, ...args], { encoding: 'utf8' })

/** The build's commit, its UTC day `now`, and whether `git status --porcelain` lists a change. */
export function buildStamp(git: RepoGit, now: Date): BuildStamp {
  return {
    commit: git('rev-parse', 'HEAD').trim(),
    date: now.toISOString().slice(0, 10),
    dirty: git('status', '--porcelain').trim() !== '',
  }
}

/** The licences page's inputs from the archives and bare repositories in `sources`. */
export function readLicencesInput(sources: string): LicencesInput {
  const archives = archivesIn(sources)
  const read = gitReader(sources)
  const trees = readNoticeTrees(COMPONENTS, NOTICE_TREES, gitTreeReader(sources))
  return {
    build: buildStamp(repoGit, new Date()),
    components: COMPONENTS,
    files: SITE_FILES,
    archives,
    notices: readNotices(COMPONENTS, read),
    trees,
    unfound: UNFOUND,
    gpl: read(COMPONENTS[GPL_TEXT.component].source, GPL_TEXT.path),
    viewerLicence: readFileSync(join(GEN5_PATHS.repo, 'LICENSE'), 'utf8'),
  }
}

/** Writes the licences page for `input` into `folder` as LICENCES_PAGE. */
export function writeLicencesPage(folder: string, input: LicencesInput): void {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, LICENCES_PAGE), licencesHtml(input))
}
