import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { cleanOutputs, parseBuildArgs } from './rom-build.ts'
import type { BuildConfig } from './rom-config.ts'
import { buildPaths } from './rom-paths.ts'
import type { BuildPaths } from './rom-paths.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-build-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const sh = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
  })

describe('the rom:build arguments', () => {
  it('builds incrementally by default', () => {
    expect(parseBuildArgs([])).toEqual({ clean: false, cleanOnly: false, all: false })
  })

  it('reads --clean for a build from a fresh tree', () => {
    expect(parseBuildArgs(['--clean'])).toEqual({ clean: true, cleanOnly: false, all: false })
  })

  it('reads --clean-only and --all for rom:clean', () => {
    expect(parseBuildArgs(['--clean-only', '--all'])).toEqual({
      clean: false,
      cleanOnly: true,
      all: true,
    })
  })

  it('refuses --all without --clean-only', () => {
    expect(() => parseBuildArgs(['--all'])).toThrow(/--all .*npm run rom:clean -- --all/)
  })

  it('refuses an unknown option and a positional argument', () => {
    expect(() => parseBuildArgs(['--fast'])).toThrow(/--fast/)
    expect(() => parseBuildArgs(['emerald'])).toThrow(/emerald/)
  })
})

interface Built {
  paths: BuildPaths
  config: BuildConfig
  outside: string
}

// A folder laid out like the repo after a build: a pinned tree with a build product, the stamp,
// the outputs, and a folder beside the repo that no clean may reach.
function built(): Built {
  const base = mkdtempSync(join(scratch, 'case-'))
  const repo = join(base, 'repo')
  mkdirSync(repo)
  const paths = buildPaths(repo)
  mkdirSync(paths.tree, { recursive: true })
  sh(paths.tree, 'init', '-q', '-b', 'master')
  writeFileSync(join(paths.tree, '.gitignore'), '*.o\n')
  writeFileSync(join(paths.tree, 'main.c'), 'int main(void) { return 0; }\n')
  sh(paths.tree, 'add', '-A')
  sh(paths.tree, 'commit', '-q', '-m', 'upstream')
  writeFileSync(join(paths.tree, 'main.o'), 'built\n')
  writeFileSync(paths.stampPath, '{}\n')
  mkdirSync(join(paths.outDir, 'repro'), { recursive: true })
  writeFileSync(join(paths.outDir, 'irv-emerald.gba'), 'rom\n')
  const outside = join(base, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'keep.txt'), 'keep\n')
  const commit = sh(paths.tree, 'rev-parse', 'HEAD').trim()
  const config: BuildConfig = {
    upstream: { repository: 'https://example.invalid/expansion', tag: 'v1', commit },
    baseRom: { sha1: '0'.repeat(40) },
    make: { jobs: 1 },
  }
  return { paths, config, outside }
}

describe('npm run rom:clean', () => {
  it('empties build/rom, drops the stamp and the build products, and keeps upstream files', () => {
    const { paths, config } = built()
    cleanOutputs(paths, config, false)
    expect(readdirSync(paths.outDir)).toEqual([])
    expect(existsSync(paths.stampPath)).toBe(false)
    expect(existsSync(join(paths.tree, 'main.o'))).toBe(false)
    expect(existsSync(join(paths.tree, 'main.c'))).toBe(true)
  })

  it('leaves the tree alone when the pin check fails', () => {
    const { paths, config } = built()
    const pin = { ...config.upstream, commit: 'f'.repeat(40) }
    expect(() => {
      cleanOutputs(paths, { ...config, upstream: pin }, false)
    }).toThrow(/stays as it is; npm run rom:clean -- --all removes it/)
    expect(existsSync(join(paths.tree, 'main.o'))).toBe(true)
  })
})

describe('npm run rom:clean -- --all', () => {
  it('deletes the tree and the stamp and keeps the cache and output folders', () => {
    const { paths, config } = built()
    cleanOutputs(paths, config, true)
    expect(existsSync(paths.tree)).toBe(false)
    expect(existsSync(paths.stampPath)).toBe(false)
    expect(readdirSync(paths.roots.cache)).toEqual([])
    expect(readdirSync(paths.outDir)).toEqual([])
  })

  it('refuses a tree outside .cache/rom and leaves it', () => {
    const { paths, config, outside } = built()
    expect(() => {
      cleanOutputs({ ...paths, tree: outside }, config, true)
    }).toThrow(/may not delete/)
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
  })

  it('refuses to delete the cache folder itself', () => {
    const { paths, config } = built()
    expect(() => {
      cleanOutputs({ ...paths, tree: paths.roots.cache }, config, true)
    }).toThrow(/may not delete/)
    expect(existsSync(join(paths.tree, 'main.c'))).toBe(true)
  })
})
