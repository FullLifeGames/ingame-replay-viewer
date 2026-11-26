import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { Reader, TreeReader } from './gen5-licences-git'
import {
  buildStamp,
  readLicencesInput,
  readNotices,
  readNoticeTrees,
  type RepoGit,
} from './gen5-licences-read'
import { type ComponentId, COMPONENTS } from './gen5-manifest'
import type { NoticeTree } from './gen5-notices'
import { GEN5_PATHS } from './gen5-paths'

// Scene: every component has its notice.
describe('the notices of the manifest', () => {
  it('lists a notice file for each component', () => {
    for (const [id, part] of Object.entries(COMPONENTS))
      expect({ id, some: part.notices.length > 0 }).toEqual({ id, some: true })
  })
})

describe('readNotices', () => {
  const files: Record<string, string> = {
    'melonds:src/NDS.cpp': 'one\ntwo\nthree\n',
  }
  const known: Reader = (source, path) => {
    const text = files[`${source.name}:${path}`]
    if (text === undefined) throw new Error(`no ${path}`)
    return text
  }
  const only = (id: ComponentId) =>
    Object.fromEntries(
      Object.entries(COMPONENTS).map(([key, part]) => [
        key,
        key === id ? { ...part, notices: part.notices.slice(0, 1) } : { ...part, notices: [] },
      ]),
    ) as unknown as typeof COMPONENTS

  it('reads each notice through the reader and keeps its lines', () => {
    const melonds = only('melonds')
    const reader: Reader = (source, path) =>
      known(source, path) + Array.from({ length: 20 }, (_, n) => `line ${String(n + 4)}`).join('\n')
    const read = readNotices(melonds, reader)
    const [first, last] = COMPONENTS.melonds.notices[0]?.lines ?? [0, 0]
    const lines = Array.from({ length: 20 + 3 }, (_, n) => `line ${String(n + 1)}`)
    lines.splice(0, 3, 'one', 'two', 'three')
    expect(read).toEqual([
      {
        ...COMPONENTS.melonds.notices[0],
        component: 'melonds',
        text: lines.slice(first - 1, last).join('\n'),
      },
    ])
  })

  it('stops, naming the component and the file, on a notice the reader cannot find', () => {
    const retroarch = only('retroarch')
    expect(() => readNotices(retroarch, known)).toThrow(
      "EmulatorJS's RetroArch: cannot read retroarch.c at 6dd4353937ef48b6ec0bfbdbb15d1c5992d86927",
    )
  })

  it('stops on a notice whose lines run past the end of its file', () => {
    expect(() => readNotices(only('melonds'), known)).toThrow(
      "EmulatorJS's melonDS: src/NDS.cpp has 3 lines, not 1 to 18",
    )
  })
})

// Scene: libretro-common's notices are read from every file under its folder at the pin.
describe('readNoticeTrees', () => {
  const tree: NoticeTree = {
    component: 'retroarch',
    part: 'lib',
    folder: 'lib/',
    extensions: ['.c', '.h'],
  }
  const files: TreeReader = (source, folder) => [
    { path: `${folder}one.c`, text: `/* MIT, at ${source.commit.slice(0, 7)} */\n` },
    { path: `${folder}two.h`, text: '/* zlib */\n' },
    { path: `${folder}read.me`, text: '/* not a source file */\n' },
    { path: 'other/three.c', text: '/* outside the folder */\n' },
  ]

  it("groups the folder's files of the tree's extensions, at the component's pinned commit", () => {
    const [read] = readNoticeTrees(COMPONENTS, [tree], files)
    expect(read).toEqual({
      ...tree,
      commit: COMPONENTS.retroarch.source.commit,
      groups: [
        { text: '/* MIT, at 6dd4353 */', paths: ['lib/one.c'] },
        { text: '/* zlib */', paths: ['lib/two.h'] },
      ],
      bare: [],
    })
  })

  it('stops, naming the component and the folder, on a folder the reader cannot read', () => {
    const none: TreeReader = () => {
      throw new Error('no such folder')
    }
    expect(() => readNoticeTrees(COMPONENTS, [tree], none)).toThrow(
      "EmulatorJS's RetroArch: cannot read lib/ at 6dd4353937ef48b6ec0bfbdbb15d1c5992d86927",
    )
  })
})

// Scene: the build stamp says when the build machine had changes the commit lacks (D9).
describe('buildStamp', () => {
  const COMMIT = '1'.repeat(40)
  const now = new Date('2026-11-25T23:30:00Z')
  /** A git that prints `status` for `status --porcelain`, and records what it was asked. */
  const git = (status: string) => {
    const asked: string[][] = []
    const run: RepoGit = (...args) => {
      asked.push(args)
      if (args.join(' ') === 'rev-parse HEAD') return `${COMMIT}\n`
      if (args.join(' ') === 'status --porcelain') return status
      throw new Error(`git ${args.join(' ')}`)
    }
    return { asked, run }
  }

  it('names the commit and the UTC day, and no changes for a clean tree', () => {
    const clean = git('')
    expect(buildStamp(clean.run, now)).toEqual({ commit: COMMIT, date: '2026-11-25', dirty: false })
    expect(clean.asked).toContainEqual(['status', '--porcelain'])
  })

  it('says the tree had changes when git status lists one', () => {
    expect(buildStamp(git(' M scripts/gen5-licences.ts\n').run, now).dirty).toBe(true)
    expect(buildStamp(git('?? scripts/new.ts\n').run, now).dirty).toBe(true)
  })
})

describe('readLicencesInput', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gen5-licences-'))

  afterAll(() => {
    rmSync(empty, { recursive: true, force: true })
  })

  it('stops with the fetch script named when the archives are not on the machine', () => {
    expect(() => readLicencesInput(empty)).toThrow('run node scripts/gen5-sources.ts first')
  })
})

// Scene: LICENSE stays MIT and unchanged (#79). The hash is LICENSE's at acf5ac7.
describe("the repository's LICENSE", () => {
  const bytes = readFileSync(join(GEN5_PATHS.repo, 'LICENSE'))

  it('starts with "MIT License" and keeps its SHA-256', () => {
    expect(bytes.toString('utf8').split('\n')[0]).toBe('MIT License')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '9f39ffe68aee9a0a4c702b2530661f07dfef6bf251cde6dc9f0db3a5c56f6c78',
    )
  })
})
