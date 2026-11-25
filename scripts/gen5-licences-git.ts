// How the Gen 5 licences page (#79) reads files at the pins: from the bare repositories that
// scripts/gen5-sources.ts keeps under .cache/gen5/sources/git/, one file with `git show
// <commit>:<path>`, a whole folder with `git ls-tree` and one `git cat-file --batch`. A file that
// is no valid UTF-8 decodes as Latin-1, so no byte is lost.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { Source } from './gen5-manifest.ts'
import type { TreeFile } from './gen5-notice-groups.ts'

/** Reads the file `path` of `source` at its pinned commit; throws when it cannot. */
export type Reader = (source: Source, path: string) => string

/** Reads every file under `folder` of `source` at its pinned commit; throws when it cannot. */
export type TreeReader = (source: Source, folder: string) => readonly TreeFile[]

export const FETCH_FIRST = 'run node scripts/gen5-sources.ts first'

/** `bytes` as UTF-8, or as Latin-1 for a file that is no valid UTF-8. */
function decoded(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

/** The bare repository of `source` under `sources`/git/; throws when it is not there. */
function repositoryOf(sources: string, source: Source): string {
  const dir = join(sources, 'git', `${source.name}.git`)
  if (!existsSync(join(dir, 'HEAD'))) {
    throw new Error(`gen5-licences: no repository of ${source.name}; ${FETCH_FIRST}`)
  }
  return dir
}

const git = (args: readonly string[], input?: string) =>
  execFileSync('git', args, {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })

/** A reader on the bare repositories under `sources`/git/. */
export function gitReader(sources: string): Reader {
  return (source, path) =>
    decoded(git(['-C', repositoryOf(sources, source), 'show', `${source.commit}:${path}`]))
}

/** The blobs `git cat-file --batch` wrote for `paths`, in their order. */
function batchTexts(out: Buffer, paths: readonly string[]): TreeFile[] {
  let at = 0
  return paths.map((path) => {
    const end = out.indexOf(0x0a, at)
    const header = out.subarray(at, end).toString('utf8').split(' ')
    const size = Number(header[2])
    if (header[1] !== 'blob' || !Number.isInteger(size)) {
      throw new Error(`gen5-licences: git cat-file gave "${header.join(' ')}" for ${path}`)
    }
    at = end + 1 + size + 1
    return { path, text: decoded(out.subarray(end + 1, end + 1 + size)) }
  })
}

/** A folder reader on the bare repositories under `sources`/git/: every file under the folder. */
export function gitTreeReader(sources: string): TreeReader {
  return (source, folder) => {
    const dir = repositoryOf(sources, source)
    const list = git(['-C', dir, 'ls-tree', '-r', '-z', '--name-only', source.commit, '--', folder])
    const paths = list
      .toString('utf8')
      .split('\0')
      .filter((path) => path !== '')
    const input = paths.map((path) => `${source.commit}:${path}\n`).join('')
    return batchTexts(git(['-C', dir, 'cat-file', '--batch'], input), paths)
  }
}
