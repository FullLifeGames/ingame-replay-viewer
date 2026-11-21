import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { patchedFiles, prepareCopies } from './wasm-overlay.ts'
import type { CopySet } from './wasm-overlay.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-overlay-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const patch = (file: string, from: string, to: string) =>
  [
    'Why: the spec needs it.',
    '',
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    `-${from}`,
    `+${to}`,
    '',
  ].join('\n')

// An upstream tree, a patch folder and the build folder the copies go to.
function layout(patches: Record<string, string>, files: CopySet['files'] = 'patched'): CopySet {
  const base = realpathSync(mkdtempSync(join(scratch, 'case-')))
  write(join(base, 'tree', 'src', 'a.c'), 'int a;\n')
  write(join(base, 'tree', 'src', 'b.c'), 'int b;\n')
  write(join(base, 'tree', 'include', 'h.h'), 'int h;\n')
  write(join(base, 'patches', 'series'), `# order\n${Object.keys(patches).join('\n')}\n`)
  for (const [name, text] of Object.entries(patches)) write(join(base, 'patches', name), text)
  const roots = { cache: join(base, '.cache', 'wasm'), out: join(base, 'build', 'wasm') }
  return {
    from: join(base, 'tree'),
    to: join(roots.out, 'overlay'),
    patches: join(base, 'patches'),
    files,
    roots,
  }
}

describe('the files of a patch', () => {
  it('come from its diff --git lines, below the reason', () => {
    const text = `${patch('src/a.c', 'x', 'y')}${patch('include/h.h', 'x', 'y')}`
    expect(patchedFiles(text, '0001-a.patch')).toEqual(['src/a.c', 'include/h.h'])
  })

  it('refuse a patch that adds a file', () => {
    const text = 'diff --git a/src/n.c b/src/n.c\nnew file mode 100644\n'
    expect(() => patchedFiles(text, '0001-n.patch')).toThrow(/0001-n\.patch adds src\/n\.c/)
  })

  it('refuse a patch that steps out of its folder', () => {
    expect(() => patchedFiles(patch('../x.c', 'a', 'b'), '0001-x.patch')).toThrow(
      /outside.*\.\.\/x\.c/,
    )
  })

  it('refuse a patch that names no file', () => {
    expect(() => patchedFiles('just words\n', '0001-x.patch')).toThrow(/0001-x\.patch/)
  })
})

describe('the patched copies', () => {
  it('copy each file a patch names and patch the copy, leaving the tree as it is', () => {
    const set = layout({
      '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;'),
      '0002-h.patch': patch('include/h.h', 'int h;', 'int h2;'),
    })
    expect(prepareCopies(set)).toEqual(['include/h.h', 'src/a.c'])
    expect(readFileSync(join(set.to, 'src', 'a.c'), 'utf8')).toBe('int a2;\n')
    expect(readFileSync(join(set.to, 'include', 'h.h'), 'utf8')).toBe('int h2;\n')
    expect(existsSync(join(set.to, 'src', 'b.c'))).toBe(false)
    expect(readFileSync(join(set.from, 'src', 'a.c'), 'utf8')).toBe('int a;\n')
  })

  it('apply two patches to one file in the order of the series', () => {
    const set = layout({
      '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;'),
      '0002-a.patch': patch('src/a.c', 'int a2;', 'int a3;'),
    })
    expect(prepareCopies(set)).toEqual(['src/a.c'])
    expect(readFileSync(join(set.to, 'src', 'a.c'), 'utf8')).toBe('int a3;\n')
  })

  it('copy every listed file, patched or not, and nothing else', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;') }, [
      'src/a.c',
      'src/b.c',
    ])
    expect(prepareCopies(set)).toEqual(['src/a.c', 'src/b.c'])
    expect(readFileSync(join(set.to, 'src', 'b.c'), 'utf8')).toBe('int b;\n')
  })

  it('refuse a patch of a file outside the list', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;') }, ['src/b.c'])
    expect(() => prepareCopies(set)).toThrow(/0001-a\.patch changes src\/a\.c, which .* lacks/)
  })

  it('refuse a patch that does not apply and name it', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int other;', 'int a2;') })
    expect(() => prepareCopies(set)).toThrow(/0001-a\.patch does not apply/)
  })

  it('drop the copies of a run before', () => {
    const set = layout({ '0001-a.patch': patch('src/a.c', 'int a;', 'int a2;') })
    write(join(set.to, 'src', 'stale.c'), 'int stale;\n')
    prepareCopies(set)
    expect(existsSync(join(set.to, 'src', 'stale.c'))).toBe(false)
  })

  it('make no copy for an empty series', () => {
    const set = layout({})
    expect(prepareCopies(set)).toEqual([])
  })

  it('refuse a folder for the copies outside build/wasm', () => {
    const set = layout({})
    expect(() => prepareCopies({ ...set, to: join(set.from, 'copies') })).toThrow(/may not delete/)
  })
})
