// The notices of a folder whose files each carry their own (#79, scripts/gen5-notices.ts,
// NOTICE_TREES): the opening comment of each file, the files grouped by that comment's text, and
// the HTML that shows each distinct text once with how many files carry it. Pure: the reader
// (scripts/gen5-licences-read.ts) hands it the files' texts read at the pin.
import { escapeHtml, pre, short } from './gen5-html.ts'
import type { NoticeTree } from './gen5-notices.ts'

/** A file of a notice tree with its text at the pin. */
export interface TreeFile {
  path: string
  text: string
}

/** One distinct opening comment and the files that open with it. */
export interface NoticeGroup {
  text: string
  paths: readonly string[]
}

/** A notice tree read at `commit`: its groups, largest first, and the files with no comment. */
export interface ReadTree extends NoticeTree {
  commit: string
  groups: readonly NoticeGroup[]
  bare: readonly string[]
}

/** The words that stand for a file's own name inside its notice. */
export const OWN_NAME = '<this file>'

/** The comment `text` opens with (a block comment, or a run of line comments), its line endings
 * as \n; undefined when the file opens with anything else. Throws on a block that never closes. */
export function openingComment(text: string): string | undefined {
  const body = text
    .replaceAll('\r\n', '\n')
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (body.startsWith('/*')) {
    const end = body.indexOf('*/', 2)
    if (end < 0) throw new Error('an opening comment that never closes')
    return body.slice(0, end + 2)
  }
  if (!body.startsWith('//')) return undefined
  const lines = body.split('\n')
  const code = lines.findIndex((line) => !line.trimStart().startsWith('//'))
  return lines.slice(0, code < 0 ? lines.length : code).join('\n')
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The files grouped by their opening comment, each file's own name in it read as OWN_NAME;
 * the largest group first, then by the first path. Throws naming a file whose comment never
 * closes. */
export function groupNotices(files: readonly TreeFile[]): Pick<ReadTree, 'groups' | 'bare'> {
  const byText = new Map<string, string[]>()
  const bare: string[] = []
  for (const { path, text } of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    let comment: string | undefined
    try {
      comment = openingComment(text)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      throw new Error(`${path}: ${why}`, { cause: error })
    }
    if (comment === undefined) bare.push(path)
    else {
      const key = comment.replaceAll(`(${nameOf(path)})`, `(${OWN_NAME})`)
      byText.set(key, [...(byText.get(key) ?? []), path])
    }
  }
  const groups = [...byText].map(([text, paths]) => ({ text, paths }))
  const first = (group: NoticeGroup) => group.paths[0] ?? ''
  groups.sort((a, b) => b.paths.length - a.paths.length || first(a).localeCompare(first(b)))
  return { groups, bare }
}

/** At most this many files of a group stand by path on the page. */
export const PATHS_SHOWN = 10

const paths = (list: readonly string[]) =>
  list.map((path) => `<code>${escapeHtml(path)}</code>`).join(', ')

function groupHtml(group: NoticeGroup): string {
  const count = group.paths.length
  const carry = count === 1 ? '1 file carries this text' : `${String(count)} files carry this text`
  const where = count <= PATHS_SHOWN ? `: ${paths(group.paths)}` : '.'
  return `<p class="from">${carry}${where}</p>\n${pre(group.text)}`
}

/** The page's block for `tree`, under its part's heading. */
export function treeHtml(tree: ReadTree): string {
  const files = tree.groups.reduce((sum, group) => sum + group.paths.length, tree.bare.length)
  const kinds = tree.extensions.join(' and ')
  const intro = `The opening comment of each ${escapeHtml(kinds)} file under ${escapeHtml(tree.folder)} at commit ${short(tree.commit)}: ${String(files)} files, ${String(tree.groups.length)} distinct texts. Where a comment names its own file, the text below reads ${escapeHtml(OWN_NAME)} in its place.`
  const bare =
    tree.bare.length === 0 ? '' : `\n<p class="from">No notice in the file: ${paths(tree.bare)}</p>`
  return `<h4>${escapeHtml(tree.part)}</h4>
<p class="from">${intro}</p>
${tree.groups.map(groupHtml).join('\n')}${bare}`
}
