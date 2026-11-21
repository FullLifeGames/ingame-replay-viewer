import { describe, expect, it } from 'vitest'

import { parseBuildArgs } from './rom-build.ts'

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
