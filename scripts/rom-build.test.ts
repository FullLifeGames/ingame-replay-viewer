import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildPaths, parseBuildArgs, REPO_DIR } from './rom-build.ts'
import { ROM_DIR } from './rom-config.ts'

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

describe('the build paths', () => {
  it('puts the tree under .cache/rom and the outputs under build/rom of this checkout', () => {
    expect(REPO_DIR).toBe(join(ROM_DIR, '..', '..'))
    expect(buildPaths({})).toEqual({
      outDir: join(REPO_DIR, 'build', 'rom'),
      tree: join(REPO_DIR, '.cache', 'rom', 'expansion'),
      stampPath: join(REPO_DIR, '.cache', 'rom', 'applied.json'),
    })
  })

  it('takes the cache folder from IRV_ROM_CACHE', () => {
    expect(buildPaths({ IRV_ROM_CACHE: '/var/cache/irv' })).toMatchObject({
      tree: '/var/cache/irv/expansion',
      stampPath: '/var/cache/irv/applied.json',
    })
  })
})
