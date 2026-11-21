import { describe, expect, it } from 'vitest'

import { checkEmccVersion, errorFileName, parseBuildArgs } from './wasm-build.ts'

describe('the wasm:build arguments', () => {
  it('runs the census into build/wasm by default', () => {
    expect(parseBuildArgs(['--census'], '/repo/build/wasm')).toEqual({
      mode: 'census',
      out: '/repo/build/wasm/census.md',
    })
  })

  it('takes a report path after the mode', () => {
    expect(parseBuildArgs(['--census-report', '/x/census.md'], '/o')).toEqual({
      mode: 'report',
      out: '/x/census.md',
    })
  })

  it.each([[[]], [['--link']], [['--census', 'relative.md']], [['--census', '/a', '/b']]])(
    'refuses %j',
    (args) => {
      expect(() => parseBuildArgs(args, '/o')).toThrow(/usage/)
    },
  )
})

describe('the Emscripten version', () => {
  const banner =
    'emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 7.0.0 (777e6e5db7b4990bcaeb1b9998ed642cc84e6629)\n'

  it('accepts the pinned release', () => {
    expect(() => {
      checkEmccVersion(banner, '7.0.0')
    }).not.toThrow()
  })

  it('refuses another release and names both', () => {
    expect(() => {
      checkEmccVersion(banner, '7.0.1')
    }).toThrow(/7\.0\.1.*7\.0\.0/)
  })
})

describe('the error file of a failed source', () => {
  it('flattens the path into one file name', () => {
    expect(errorFileName('src/battle_main.c')).toBe('src_battle_main.c.err')
  })
})
