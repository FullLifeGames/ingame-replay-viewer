import { describe, expect, it } from 'vitest'

import { checkEmccVersion, errorFileName, linkSteps, parseBuildArgs } from './wasm-build.ts'
import type { LinkSteps } from './wasm-build.ts'
import { DIVIDE_OPS } from './wasm-divide.ts'
import type { DivideCounts } from './wasm-divide.ts'

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

describe('the steps of the link', () => {
  const counts = (value: number) =>
    Object.fromEntries(DIVIDE_OPS.map((op) => [op, value])) as DivideCounts['rewritten']

  function recorded(): { steps: LinkSteps; order: string[] } {
    const order: string[] = []
    const steps: LinkSteps = {
      link: () => (order.push('link'), 'Link: 3 objects, 60 s.'),
      divide: () => {
        order.push('divide')
        return Promise.resolve({ rewritten: counts(2), inHelpers: counts(1) })
      },
      sizes: () => (order.push('sizes'), 'Sizes: irv-emerald.wasm 9 B.'),
      patch: () => (order.push('patch'), 'Patch: wrote it.'),
      discard: () => {
        order.push('discard')
      },
    }
    return { steps, order }
  }

  it('rewrite the divisions after the link and before the sizes and the patch', async () => {
    const { steps, order } = recorded()
    const lines = await linkSteps(steps)
    expect(order).toEqual(['link', 'divide', 'sizes', 'patch'])
    expect(lines[0]).toBe('Link: 3 objects, 60 s.')
    expect(lines[1]).toMatch(
      /^Divide: calls the helpers at i32\.div_s 2, .*i64\.rem_u 2; the helpers keep i32\.div_s 1, .*i64\.rem_u 1; \d+ s\.$/,
    )
    expect(lines.slice(2)).toEqual(['Sizes: irv-emerald.wasm 9 B.', 'Patch: wrote it.'])
  })

  it('leave a sanitized module as the link wrote it, with no rewrite and no patch', async () => {
    const { steps, order } = recorded()
    const lines = await linkSteps(steps, 'shift')
    expect(order).toEqual(['link', 'sizes'])
    expect(lines).toEqual([
      'Link: 3 objects, 60 s.',
      'Divide: none for a sanitized module.',
      'Sizes: irv-emerald.wasm 9 B.',
      'Patch: none for a sanitized module.',
    ])
  })

  it('remove the plain link when its rewrite fails, so no later step takes it for a finished one', async () => {
    const { steps, order } = recorded()
    const failing = {
      ...steps,
      divide: () => (order.push('divide'), Promise.reject(new Error('wasm-dis failed'))),
    }
    await expect(linkSteps(failing)).rejects.toThrow('wasm-dis failed')
    expect(order).toEqual(['link', 'divide', 'discard'])
  })
})
