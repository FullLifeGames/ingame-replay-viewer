import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import { afterAll, describe, expect, it } from 'vitest'

import { archiveName, type Source, SOURCES } from './gen5-manifest'
import { pinFaults } from './gen5-manifest-check'
import {
  fetchInto,
  fetchSteps,
  pinRef,
  placeArchive,
  verifyFetchHead,
  verifyTarHash,
} from './gen5-sources'

const PIN: Source = {
  name: 'tool',
  repository: 'https://github.com/example/tool',
  commit: 'a'.repeat(40),
  tar: 'b'.repeat(64),
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

describe('pinFaults', () => {
  it('passes a pin with a plain name, a GitHub repository, a full commit and a tar hash', () => {
    expect(pinFaults(PIN)).toEqual([])
  })

  it('names each fault of a pin with its source', () => {
    const bad = { name: 'Tool/x', repository: 'https://example.com/tool.git', commit: 'abc1234' }
    expect(pinFaults({ ...bad, tar: 'b'.repeat(63) })).toEqual([
      'Tool/x: the name is not lower-case letters, digits, dots and dashes',
      'Tool/x: the repository is no https://github.com/<owner>/<repo>',
      'Tool/x: the commit is no full 40-hex id',
      "Tool/x: the tar's SHA-256 is no 64-hex digest",
    ])
  })

  it('passes every pin of the manifest', () => {
    expect(SOURCES.length).toBeGreaterThan(0)
    expect(SOURCES.flatMap(pinFaults)).toEqual([])
  })
})

describe('fetchSteps', () => {
  const dir = '/invented/sources/git/tool.git'
  const fetch = ['-C', dir, 'fetch', '-q', '--depth', '1', `${PIN.repository}.git`, PIN.commit]

  it('makes a bare repository and fetches the pinned commit alone, at depth 1', () => {
    expect(fetchSteps(dir, PIN, true)).toEqual([['init', '-q', '--bare', dir], fetch])
  })

  it('fetches again into the bare repository of an earlier run', () => {
    expect(fetchSteps(dir, PIN, false)).toEqual([fetch])
  })
})

// Scene: git's housekeeping must not prune the pinned commit, which only FETCH_HEAD names.
describe('fetchInto', () => {
  const dir = '/invented/sources/git/tool.git'
  const run = (head: string) => {
    const calls: string[][] = []
    const git = (args: string[]) => {
      calls.push(args)
      return args.includes('rev-parse') ? `${head}\n` : ''
    }
    return { calls, git }
  }

  it('fetches, checks FETCH_HEAD against the pin, then keeps a ref under refs/pins/ on it', () => {
    const { calls, git } = run(PIN.commit)
    fetchInto(dir, PIN, true, git)
    expect(pinRef(PIN)).toBe('refs/pins/tool')
    expect(calls).toEqual([
      ...fetchSteps(dir, PIN, true),
      ['-C', dir, 'rev-parse', 'FETCH_HEAD'],
      ['-C', dir, 'update-ref', 'refs/pins/tool', PIN.commit],
    ])
  })

  it('sets no ref when the fetch brought another commit', () => {
    const { calls, git } = run('c'.repeat(40))
    expect(() => {
      fetchInto(dir, PIN, false, git)
    }).toThrow(`tool: fetched ${'c'.repeat(40)}, not the pinned ${PIN.commit}`)
    expect(calls.some((args) => args.includes('update-ref'))).toBe(false)
  })
})

// Scene: a changed archive stops the fetch.
describe('verifyFetchHead and verifyTarHash', () => {
  it('pass the pinned commit and the pinned tar', () => {
    expect(() => {
      verifyFetchHead(PIN.commit, PIN)
      verifyTarHash(PIN.tar, PIN)
    }).not.toThrow()
  })

  it('throw on another commit or another tar, naming the source', () => {
    expect(() => {
      verifyFetchHead('c'.repeat(40), PIN)
    }).toThrow(`tool: fetched ${'c'.repeat(40)}, not the pinned ${PIN.commit}`)
    const other = sha256('other bytes')
    expect(() => {
      verifyTarHash(other, PIN)
    }).toThrow(`tool: the tar's SHA-256 ${other} differs from the pinned ${PIN.tar}`)
  })
})

describe('placeArchive', () => {
  const root = mkdtempSync(join(tmpdir(), 'gen5-sources-'))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args])
  git('init', '-q')
  writeFileSync(join(repo, 'tool.c'), 'int main(void) { return 0; }\n')
  git('add', 'tool.c')
  const author = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid']
  git(...author, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'invented')
  const commit = git('rev-parse', 'HEAD').toString().trim()
  const tar = git('archive', '--format=tar', `--prefix=tool-${commit}/`, commit)
  const source: Source = { ...PIN, commit, tar: sha256(tar) }

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("places the gzipped tar under its archive name when the tar's hash is the pin", async () => {
    const folder = mkdtempSync(join(root, 'placed-'))
    const size = await placeArchive(join(repo, '.git'), source, folder)
    expect(readdirSync(folder)).toEqual([archiveName(source)])
    const bytes = readFileSync(join(folder, archiveName(source)))
    expect(size).toBe(bytes.length)
    expect(sha256(gunzipSync(bytes))).toBe(source.tar)
  })

  it('places no file, not even the part, and names the source when the tar differs', async () => {
    const folder = mkdtempSync(join(root, 'refused-'))
    await expect(
      placeArchive(join(repo, '.git'), { ...source, tar: PIN.tar }, folder),
    ).rejects.toThrow(`tool: the tar's SHA-256 ${source.tar} differs from the pinned ${PIN.tar}`)
    expect(readdirSync(folder)).toEqual([])
  })
})
