import { describe, expect, it } from 'vitest'

import { checkEmccVersion, errorFileName, parseBuildArgs } from './wasm-build.ts'

describe('the wasm:build arguments', () => {
  it('runs the census into build/wasm by default', () => {
    expect(parseBuildArgs(['--census'], '/repo/build/wasm')).toEqual({
      mode: 'census',
      out: '/repo/build/wasm/census.md',
    })
  })

  it('compiles every file of the build at -O2 with its report in build/wasm by default', () => {
    expect(parseBuildArgs(['--compile'], '/repo/build/wasm')).toEqual({
      mode: 'compile',
      out: '/repo/build/wasm/compile.md',
    })
  })

  it('links the glue and the compiled objects with its report in build/wasm by default', () => {
    expect(parseBuildArgs(['--link'], '/repo/build/wasm')).toEqual({
      mode: 'link',
      out: '/repo/build/wasm/link.md',
    })
  })

  it('writes the module patch from the dump on its own, its line in build/wasm by default', () => {
    expect(parseBuildArgs(['--patch'], '/repo/build/wasm')).toEqual({
      mode: 'patch',
      out: '/repo/build/wasm/patch.md',
    })
  })

  it('takes a report path after the mode', () => {
    expect(parseBuildArgs(['--census-report', '/x/census.md'], '/o')).toEqual({
      mode: 'report',
      out: '/x/census.md',
    })
  })

  it('compiles and links a sanitized build with its reports under build/wasm/sanitize', () => {
    expect(parseBuildArgs(['--compile', '--sanitize', 'shift'], '/repo/build/wasm')).toEqual({
      mode: 'compile',
      out: '/repo/build/wasm/sanitize/compile.md',
      sanitize: 'shift',
    })
    expect(parseBuildArgs(['--sanitize', 'shift', '--link', '/x/l.md'], '/o')).toEqual({
      mode: 'link',
      out: '/x/l.md',
      sanitize: 'shift',
    })
  })

  it.each([[['--census', '--sanitize', 'shift']], [['--patch', '--sanitize', 'shift']]])(
    'refuses a sanitized %j, which only --compile and --link take',
    (args) => {
      expect(() => parseBuildArgs(args, '/o')).toThrow(/usage/)
    },
  )

  it('refuses a check it does not know', () => {
    expect(() => parseBuildArgs(['--compile', '--sanitize', 'address'], '/o')).toThrow(/address/)
    expect(() => parseBuildArgs(['--compile', '--sanitize'], '/o')).toThrow(/shift/)
  })

  it.each([[[]], [['--census', 'relative.md']], [['--census', '/a', '/b']]])(
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
